const crypto = require('crypto');
const pool = require('../config/db');
const { getRazorpayInstance, isRazorpayConfigured } = require('../config/razorpay');

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

// 1. Get Razorpay public config (key_id)
exports.getRazorpayConfigController = async (req, res) => {
    try {
        const configured = isRazorpayConfigured();
        return res.status(200).json({
            success: true,
            configured,
            keyId: configured ? process.env.RAZORPAY_KEY_ID : null
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: "Failed to read Razorpay configuration."
        });
    }
};

// 2. Create Razorpay order
exports.createRazorpayOrderController = async (req, res) => {
    try {
        const userEmail = req.payload;
        if (!userEmail) {
            return res.status(401).json({
                success: false,
                message: "Please log in to initiate payment."
            });
        }

        const { amount, receipt } = req.body;
        const numAmount = parseFloat(amount);

        if (!numAmount || numAmount <= 0) {
            return res.status(400).json({
                success: false,
                message: "A valid positive amount is required to create a payment order."
            });
        }

        const razorpay = getRazorpayInstance();
        if (!razorpay) {
            return res.status(400).json({
                success: false,
                message: "Razorpay is not yet configured. Please set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in backend .env."
            });
        }

        // Razorpay amounts are represented in the smallest currency sub-unit (paise for INR)
        const amountInPaise = Math.round(numAmount * 100);

        const options = {
            amount: amountInPaise,
            currency: "INR",
            receipt: receipt || `rcpt_${Date.now().toString().slice(-8)}`,
            payment_capture: 1
        };

        const razorpayOrder = await razorpay.orders.create(options);

        return res.status(200).json({
            success: true,
            orderId: razorpayOrder.id,
            amount: razorpayOrder.amount,
            currency: razorpayOrder.currency,
            keyId: process.env.RAZORPAY_KEY_ID
        });
    } catch (error) {
        console.error("Razorpay order creation error:", error);
        return res.status(500).json({
            success: false,
            message: error.description || error.message || "Failed to initialize Razorpay payment."
        });
    }
};

// 3. Verify Razorpay payment signature & create verified order
exports.verifyRazorpayPaymentController = async (req, res) => {
    try {
        const userEmail = req.payload;
        if (!userEmail) {
            return res.status(401).json({
                success: false,
                message: "Please log in to verify payment."
            });
        }

        const {
            razorpay_order_id,
            razorpay_payment_id,
            razorpay_signature,
            orderPayload
        } = req.body;

        if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
            return res.status(400).json({
                success: false,
                message: "Missing Razorpay verification tokens (order_id, payment_id, or signature)."
            });
        }

        const keySecret = process.env.RAZORPAY_KEY_SECRET;
        if (!keySecret) {
            return res.status(500).json({
                success: false,
                message: "Razorpay secret key is missing in backend configuration."
            });
        }

        // Verify cryptographic HMAC SHA256 signature
        const hmac = crypto.createHmac('sha256', keySecret);
        hmac.update(`${razorpay_order_id}|${razorpay_payment_id}`);
        const generatedSignature = hmac.digest('hex');

        if (generatedSignature !== razorpay_signature) {
            console.error("Signature mismatch:", { generatedSignature, razorpay_signature });
            return res.status(400).json({
                success: false,
                message: "Payment signature verification failed. The transaction may be compromised."
            });
        }

        // Payment is genuine and verified!
        // Now create the verified order in database
        const {
            name,
            phone,
            address,
            city,
            state,
            pin,
            items,
            subtotal,
            deliveryFee,
            totalAmount
        } = orderPayload || {};

        if (!items || !Array.isArray(items) || items.length === 0) {
            return res.status(400).json({
                success: false,
                message: "Order items cannot be empty."
            });
        }

        const customerName = (name || userEmail.split('@')[0]).trim();
        const customerEmail = userEmail;
        const orderNumber = "HZ" + Date.now().toString().slice(-6) + Math.floor(Math.random() * 100);

        let computedSubtotal = 0;
        for (const it of items) {
            const price = parseFloat(it.offer || it.effectivePrice || it.price) || 0;
            const qty = parseInt(it.qty || it.quantity, 10) || 1;
            computedSubtotal += price * qty;
        }

        const finalDelivery = deliveryFee !== undefined ? parseFloat(deliveryFee) : (computedSubtotal >= 499 ? 0 : 49);
        const finalTotal = totalAmount !== undefined ? parseFloat(totalAmount) : (computedSubtotal + finalDelivery);

        const [result] = await pool.query(
            `INSERT INTO orders 
             (order_number, user_email, username, phone, address, city, state, pin, payment_method, payment_status, razorpay_order_id, razorpay_payment_id, order_status, subtotal, delivery_fee, total_amount, items_json)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Online Payment (Razorpay)', 'Paid', ?, ?, 'Placed', ?, ?, ?, ?)`,
            [
                orderNumber,
                customerEmail,
                customerName,
                String(phone || '').trim(),
                String(address || '').trim(),
                city ? city.trim() : null,
                state ? state.trim() : "Kerala",
                pin ? pin.trim() : null,
                razorpay_order_id,
                razorpay_payment_id,
                computedSubtotal,
                finalDelivery,
                finalTotal,
                JSON.stringify(items)
            ]
        );

        // Clear user's cart in database
        await pool.query("DELETE FROM carts WHERE user_email = ?", [customerEmail]).catch(() => {});

        const [createdRows] = await pool.query("SELECT * FROM orders WHERE id = ?", [result.insertId]);
        const createdOrder = parseOrder(createdRows[0]);

        return res.status(201).json({
            success: true,
            message: "Payment verified and order placed successfully!",
            order: createdOrder
        });
    } catch (error) {
        console.error("Verify payment error:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to finalize order after payment.",
            error: error.message
        });
    }
};
