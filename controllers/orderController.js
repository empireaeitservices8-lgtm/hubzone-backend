const pool = require("../config/db");

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
        paymentStatus: o.payment_status || (o.payment_method === 'Cash on Delivery' ? 'Pending' : 'Paid'),
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

// Create new order (Authenticated users only)
exports.createOrderController = async (req, res) => {
    try {
        const userEmail = req.payload;
        if (!userEmail) {
            return res.status(401).json({
                success: false,
                message: "Please log in to place an order."
            });
        }
        const {
            name,
            username,
            phone,
            address,
            city,
            state,
            pin,
            paymentMethod,
            items,
            subtotal,
            deliveryFee,
            totalAmount
        } = req.body;

        if (!items || !Array.isArray(items) || items.length === 0) {
            return res.status(400).json({
                success: false,
                message: "Cart items cannot be empty."
            });
        }

        if (!address || !phone) {
            return res.status(400).json({
                success: false,
                message: "Delivery address and phone number are required."
            });
        }

        // Online orders must always be verified through /payment/razorpay/verify
        if (paymentMethod && (paymentMethod.toLowerCase().includes('online') || paymentMethod.toLowerCase().includes('razorpay'))) {
            return res.status(400).json({
                success: false,
                message: "Online payment orders must be completed and verified through Razorpay before order creation."
            });
        }

        const customerName = (name || username || userEmail.split("@")[0]).trim();
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
             (order_number, user_email, username, phone, address, city, state, pin, payment_method, order_status, subtotal, delivery_fee, total_amount, items_json)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'Placed', ?, ?, ?, ?)`,
            [
                orderNumber,
                customerEmail,
                customerName,
                String(phone).trim(),
                address.trim(),
                city ? city.trim() : null,
                state ? state.trim() : "Kerala",
                pin ? pin.trim() : null,
                paymentMethod || 'Cash on Delivery',
                computedSubtotal,
                finalDelivery,
                finalTotal,
                JSON.stringify(items)
            ]
        );

        // If user logged in, clear their cart in database
        if (userEmail) {
            await pool.query("DELETE FROM carts WHERE user_email = ?", [userEmail]);
        }

        const [createdRows] = await pool.query("SELECT * FROM orders WHERE id = ?", [result.insertId]);

        return res.status(201).json({
            success: true,
            message: "Order placed successfully!",
            order: parseOrder(createdRows[0])
        });
    } catch (error) {
        console.error("Create order error:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to place order.",
            error: error.message
        });
    }
};

// Customer: Get my orders
exports.getMyOrdersController = async (req, res) => {
    try {
        const userEmail = req.payload;

        const [rows] = await pool.query(
            "SELECT * FROM orders WHERE user_email = ? ORDER BY id DESC",
            [userEmail]
        );

        return res.status(200).json({
            success: true,
            orders: rows.map(parseOrder)
        });
    } catch (error) {
        console.error("Get my orders error:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to fetch your orders.",
            error: error.message
        });
    }
};

// View single order by id or order_number
exports.getOrderByIdController = async (req, res) => {
    try {
        const { id } = req.params;

        const [rows] = await pool.query(
            "SELECT * FROM orders WHERE id = ? OR order_number = ? LIMIT 1",
            [id, id]
        );

        if (rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Order not found."
            });
        }

        const order = parseOrder(rows[0]);

        // If not admin, verify ownership
        if (req.role !== 'admin' && req.payload !== order.userEmail) {
            return res.status(403).json({
                success: false,
                message: "Unauthorized to view this order."
            });
        }

        return res.status(200).json({
            success: true,
            order
        });
    } catch (error) {
        console.error("View order error:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to fetch order details.",
            error: error.message
        });
    }
};

// Admin: Get all orders
exports.getAllOrdersController = async (req, res) => {
    try {
        const { status } = req.query;

        let query = "SELECT * FROM orders";
        const params = [];

        if (status && status !== 'all' && status !== 'All') {
            query += " WHERE order_status = ?";
            params.push(status);
        }

        query += " ORDER BY id DESC";

        const [rows] = await pool.query(query, params);

        return res.status(200).json({
            success: true,
            orders: rows.map(parseOrder)
        });
    } catch (error) {
        console.error("Get all orders error:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to fetch all orders.",
            error: error.message
        });
    }
};

// Admin: Update order status (Shipped, Delivered, Placed, Cancelled)
exports.updateOrderStatusController = async (req, res) => {
    try {
        const { id } = req.params;
        const { orderStatus, status } = req.body;
        const targetStatus = orderStatus || status;

        const allowed = ["Placed", "Shipped", "Delivered", "Cancelled"];
        if (!allowed.includes(targetStatus)) {
            return res.status(400).json({
                success: false,
                message: `Status must be one of: ${allowed.join(", ")}`
            });
        }

        const [existing] = await pool.query("SELECT * FROM orders WHERE id = ? OR order_number = ? LIMIT 1", [id, id]);
        if (existing.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Order not found."
            });
        }

        const orderId = existing[0].id;

        await pool.query("UPDATE orders SET order_status = ? WHERE id = ?", [targetStatus, orderId]);
        const [updatedRows] = await pool.query("SELECT * FROM orders WHERE id = ?", [orderId]);

        return res.status(200).json({
            success: true,
            message: `Order status updated to '${targetStatus}'.`,
            order: parseOrder(updatedRows[0])
        });
    } catch (error) {
        console.error("Update order status error:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to update order status.",
            error: error.message
        });
    }
};

// Customer: Cancel order
exports.cancelMyOrderController = async (req, res) => {
    try {
        const userEmail = req.payload;
        const { id } = req.params;

        const [rows] = await pool.query(
            "SELECT * FROM orders WHERE (id = ? OR order_number = ?) AND user_email = ? LIMIT 1",
            [id, id, userEmail]
        );

        if (rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Order not found."
            });
        }

        const order = rows[0];
        if (order.order_status !== "Placed") {
            return res.status(400).json({
                success: false,
                message: `Cannot cancel order that has already been ${order.order_status.toLowerCase()}.`
            });
        }

        await pool.query("UPDATE orders SET order_status = 'Cancelled' WHERE id = ?", [order.id]);

        return res.status(200).json({
            success: true,
            message: "Order cancelled successfully."
        });
    } catch (error) {
        console.error("Cancel order error:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to cancel order.",
            error: error.message
        });
    }
};

// Admin: Permanently delete order from database
exports.deleteOrderController = async (req, res) => {
    try {
        const { id } = req.params;

        const [existing] = await pool.query(
            "SELECT id, order_number FROM orders WHERE id = ? OR order_number = ? LIMIT 1",
            [id, id]
        );

        if (existing.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Order not found."
            });
        }

        const orderId = existing[0].id;
        const orderNumber = existing[0].order_number;

        await pool.query("DELETE FROM orders WHERE id = ?", [orderId]);

        return res.status(200).json({
            success: true,
            message: `Order #${orderNumber} has been permanently deleted from database.`
        });
    } catch (error) {
        console.error("Delete order error:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to delete order from database.",
            error: error.message
        });
    }
};

