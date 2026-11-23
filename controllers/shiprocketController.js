const pool = require('../config/db');
const {
    isShiprocketConfigured,
    createShiprocketOrder,
    assignAwb,
    trackShipment,
    checkServiceability
} = require('../config/shiprocket');

function parseOrder(o) {
    if (!o) return null;
    let items = [];
    try {
        items = typeof o.items_json === 'string' ? JSON.parse(o.items_json) : o.items_json;
    } catch {
        items = [];
    }

    return {
        id: o.id,
        orderNumber: o.order_number,
        userEmail: o.user_email,
        username: o.username,
        phone: o.phone,
        address: o.address,
        city: o.city,
        state: o.state,
        pin: o.pin,
        paymentMethod: o.payment_method,
        paymentStatus: o.payment_status || 'Pending',
        razorpayOrderId: o.razorpay_order_id,
        razorpayPaymentId: o.razorpay_payment_id,
        shiprocketOrderId: o.shiprocket_order_id,
        shiprocketShipmentId: o.shiprocket_shipment_id,
        awbCode: o.awb_code,
        courierName: o.courier_name,
        trackingUrl: o.tracking_url,
        orderStatus: o.order_status,
        subtotal: parseFloat(o.subtotal) || 0,
        deliveryFee: parseFloat(o.delivery_fee) || 0,
        totalAmount: parseFloat(o.total_amount) || 0,
        items,
        itemCount: Array.isArray(items) ? items.reduce((sum, it) => sum + (it.qty || it.quantity || 1), 0) : 0,
        createdAt: o.created_at,
        updatedAt: o.updated_at
    };
}

// 1. Get Shiprocket configuration status (Admin)
exports.getConfigController = async (req, res) => {
    try {
        const configured = isShiprocketConfigured();
        return res.status(200).json({
            success: true,
            configured,
            email: configured ? process.env.SHIPROCKET_EMAIL : null,
            pickupLocation: process.env.SHIPROCKET_PICKUP_LOCATION || 'Primary'
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: 'Failed to read Shiprocket config.',
            error: error.message
        });
    }
};

// 2. Create order in Shiprocket (Admin)
exports.createShipmentController = async (req, res) => {
    try {
        const { orderId } = req.params;

        if (!isShiprocketConfigured()) {
            return res.status(400).json({
                success: false,
                message: 'Shiprocket is not configured yet. Please set SHIPROCKET_EMAIL and SHIPROCKET_PASSWORD in backend .env.'
            });
        }

        const [rows] = await pool.query(
            "SELECT * FROM orders WHERE id = ? OR order_number = ? LIMIT 1",
            [orderId, orderId]
        );

        if (rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Order not found.'
            });
        }

        const order = parseOrder(rows[0]);

        if (order.shiprocketOrderId) {
            return res.status(200).json({
                success: true,
                message: 'Shiprocket order already created.',
                order,
                shiprocketOrderId: order.shiprocketOrderId,
                shipmentId: order.shiprocketShipmentId
            });
        }

        const srResult = await createShiprocketOrder(order);
        const srOrderId = srResult.order_id;
        const srShipmentId = srResult.shipment_id;

        await pool.query(
            `UPDATE orders 
             SET shiprocket_order_id = ?, shiprocket_shipment_id = ? 
             WHERE id = ?`,
            [srOrderId, srShipmentId, order.id]
        );

        const [updatedRows] = await pool.query("SELECT * FROM orders WHERE id = ?", [order.id]);

        return res.status(200).json({
            success: true,
            message: `Order #${order.orderNumber} pushed to Shiprocket successfully!`,
            order: parseOrder(updatedRows[0]),
            shiprocketResponse: srResult
        });
    } catch (error) {
        console.error('Shiprocket create shipment error:', error);
        return res.status(500).json({
            success: false,
            message: error.message || 'Failed to create shipment on Shiprocket.',
            error: error.message
        });
    }
};

// 3. Assign Courier & Generate AWB (Admin)
exports.assignAwbController = async (req, res) => {
    try {
        const { orderId } = req.params;
        const { courierId } = req.body || {};

        if (!isShiprocketConfigured()) {
            return res.status(400).json({
                success: false,
                message: 'Shiprocket credentials are not configured.'
            });
        }

        const [rows] = await pool.query(
            "SELECT * FROM orders WHERE id = ? OR order_number = ? LIMIT 1",
            [orderId, orderId]
        );

        if (rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Order not found.'
            });
        }

        const order = parseOrder(rows[0]);

        // If order hasn't been pushed to Shiprocket yet, push it first
        let shipmentId = order.shiprocketShipmentId;
        if (!shipmentId) {
            const srResult = await createShiprocketOrder(order);
            shipmentId = srResult.shipment_id;
            await pool.query(
                `UPDATE orders 
                 SET shiprocket_order_id = ?, shiprocket_shipment_id = ? 
                 WHERE id = ?`,
                [srResult.order_id, shipmentId, order.id]
            );
        }

        const awbResult = await assignAwb(shipmentId, courierId);
        const awbData = awbResult?.response?.data || awbResult;

        const awbCode = awbData?.awb_code || awbResult?.awb_code;
        const courierName = awbData?.courier_name || awbResult?.courier_name || 'Shiprocket Courier';
        const trackingUrl = `https://shiprocket.co/tracking/${awbCode}`;

        await pool.query(
            `UPDATE orders 
             SET awb_code = ?, courier_name = ?, tracking_url = ?, order_status = 'Shipped' 
             WHERE id = ?`,
            [awbCode, courierName, trackingUrl, order.id]
        );

        const [updatedRows] = await pool.query("SELECT * FROM orders WHERE id = ?", [order.id]);

        return res.status(200).json({
            success: true,
            message: `AWB ${awbCode} generated successfully with ${courierName}!`,
            order: parseOrder(updatedRows[0]),
            awbResult
        });
    } catch (error) {
        console.error('Shiprocket assign AWB error:', error);
        return res.status(500).json({
            success: false,
            message: error.message || 'Failed to generate AWB and assign courier in Shiprocket.',
            error: error.message
        });
    }
};

// 4. Track shipment by AWB or Order Number (Public / Customer)
exports.trackOrderController = async (req, res) => {
    try {
        const { query } = req.params;

        // Try looking up order in database first
        const [rows] = await pool.query(
            "SELECT * FROM orders WHERE awb_code = ? OR order_number = ? OR id = ? LIMIT 1",
            [query, query, query]
        );

        let awbToTrack = query;
        let matchedOrder = null;

        if (rows.length > 0) {
            matchedOrder = parseOrder(rows[0]);
            if (matchedOrder.awbCode) {
                awbToTrack = matchedOrder.awbCode;
            }
        }

        if (!isShiprocketConfigured()) {
            return res.status(200).json({
                success: true,
                simulated: true,
                order: matchedOrder,
                tracking: {
                    status: matchedOrder?.orderStatus || 'Placed',
                    awb_code: matchedOrder?.awbCode || null,
                    courier_name: matchedOrder?.courierName || 'Shiprocket Logistics',
                    tracking_url: matchedOrder?.trackingUrl || null,
                    message: 'Shiprocket credentials pending. Tracking is in simulation mode.'
                }
            });
        }

        const trackResult = await trackShipment(awbToTrack);

        return res.status(200).json({
            success: true,
            order: matchedOrder,
            tracking: trackResult
        });
    } catch (error) {
        console.error('Shiprocket track error:', error);
        return res.status(500).json({
            success: false,
            message: error.message || 'Unable to track shipment.',
            error: error.message
        });
    }
};

// 5. Check Pincode Serviceability (Public)
exports.checkServiceabilityController = async (req, res) => {
    try {
        const { pincode, weight, cod } = req.query;

        if (!pincode || !/^\d{6}$/.test(pincode.trim())) {
            return res.status(400).json({
                success: false,
                message: 'A valid 6-digit delivery pincode is required.'
            });
        }

        if (!isShiprocketConfigured()) {
            return res.status(200).json({
                success: true,
                serviceable: true,
                pincode: pincode.trim(),
                estimatedDays: 3,
                availableCouriers: [
                    { courier_name: 'Delhivery Surface', rate: 49, etd: '3-4 Days' },
                    { courier_name: 'BlueDart Express', rate: 75, etd: '2-3 Days' },
                    { courier_name: 'DTDC Surface', rate: 45, etd: '3-5 Days' }
                ],
                message: 'All-India standard serviceability active.'
            });
        }

        const numWeight = parseFloat(weight) || 0.5;
        const isCod = cod === '1' || cod === 'true';

        const result = await checkServiceability(pincode.trim(), numWeight, isCod);
        const data = result?.data || {};

        return res.status(200).json({
            success: true,
            serviceable: (data.available_courier_companies || []).length > 0,
            couriers: data.available_courier_companies || [],
            recommendedCourier: data.recommended_courier_company_id || null,
            raw: result
        });
    } catch (error) {
        console.error('Shiprocket serviceability error:', error);
        return res.status(500).json({
            success: false,
            message: error.message || 'Failed to check pincode serviceability.',
            error: error.message
        });
    }
};
