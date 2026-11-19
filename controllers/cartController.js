const pool = require("../config/db");

// Get user's cart
exports.getCartController = async (req, res) => {
    try {
        const userEmail = req.payload;

        const [rows] = await pool.query(
            `SELECT c.id as cart_id, c.product_id, c.quantity, c.updated_at,
                    p.name, p.cat, p.sub, p.price, p.offer, p.img, p.status
             FROM carts c
             JOIN products p ON c.product_id = p.id
             WHERE c.user_email = ?
             ORDER BY c.id DESC`,
            [userEmail]
        );

        const items = rows.map(r => ({
            cartId: r.cart_id,
            id: r.product_id,
            productId: r.product_id,
            name: r.name,
            cat: r.cat,
            sub: r.sub,
            price: parseFloat(r.price) || 0,
            offer: r.offer !== null ? parseFloat(r.offer) : undefined,
            effectivePrice: r.offer !== null ? parseFloat(r.offer) : (parseFloat(r.price) || 0),
            img: r.img,
            status: r.status,
            qty: r.quantity,
            quantity: r.quantity
        }));

        const subtotal = items.reduce((sum, it) => sum + (it.effectivePrice * it.qty), 0);
        const count = items.reduce((sum, it) => sum + it.qty, 0);

        return res.status(200).json({
            success: true,
            items,
            count,
            subtotal
        });
    } catch (error) {
        console.error("Get cart error:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to fetch cart.",
            error: error.message
        });
    }
};

// Add product to cart
exports.addToCartController = async (req, res) => {
    try {
        const userEmail = req.payload;
        const { productId, quantity } = req.body;
        const qty = Math.max(1, parseInt(quantity, 10) || 1);

        if (!productId) {
            return res.status(400).json({
                success: false,
                message: "Product ID is required."
            });
        }

        // Check if product exists
        const [products] = await pool.query("SELECT id, name, price, offer, status FROM products WHERE id = ? LIMIT 1", [productId]);
        if (products.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Product not found."
            });
        }

        // Check if already in user's cart
        const [existing] = await pool.query("SELECT * FROM carts WHERE user_email = ? AND product_id = ? LIMIT 1", [userEmail, productId]);

        if (existing.length > 0) {
            const newQty = existing[0].quantity + qty;
            await pool.query("UPDATE carts SET quantity = ? WHERE id = ?", [newQty, existing[0].id]);
        } else {
            await pool.query(
                "INSERT INTO carts (user_email, product_id, quantity) VALUES (?, ?, ?)",
                [userEmail, productId, qty]
            );
        }

        return res.status(200).json({
            success: true,
            message: `Added ${products[0].name} to cart!`
        });
    } catch (error) {
        console.error("Add to cart error:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to add product to cart.",
            error: error.message
        });
    }
};

// Update item quantity
exports.updateQuantityController = async (req, res) => {
    try {
        const userEmail = req.payload;
        const { productId, quantity } = req.body;
        const qty = parseInt(quantity, 10);

        if (!productId || isNaN(qty)) {
            return res.status(400).json({
                success: false,
                message: "Product ID and valid quantity are required."
            });
        }

        if (qty <= 0) {
            await pool.query("DELETE FROM carts WHERE user_email = ? AND product_id = ?", [userEmail, productId]);
            return res.status(200).json({
                success: true,
                message: "Item removed from cart."
            });
        }

        await pool.query(
            "UPDATE carts SET quantity = ? WHERE user_email = ? AND product_id = ?",
            [qty, userEmail, productId]
        );

        return res.status(200).json({
            success: true,
            message: "Cart updated."
        });
    } catch (error) {
        console.error("Update quantity error:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to update quantity.",
            error: error.message
        });
    }
};

// Remove single product from cart
exports.removeCartItemController = async (req, res) => {
    try {
        const userEmail = req.payload;
        const { productId } = req.params;

        await pool.query(
            "DELETE FROM carts WHERE user_email = ? AND (product_id = ? OR id = ?)",
            [userEmail, productId, parseInt(productId) || 0]
        );

        return res.status(200).json({
            success: true,
            message: "Item removed from cart."
        });
    } catch (error) {
        console.error("Remove cart item error:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to remove item from cart.",
            error: error.message
        });
    }
};

// Clear entire cart
exports.clearCartController = async (req, res) => {
    try {
        const userEmail = req.payload;
        await pool.query("DELETE FROM carts WHERE user_email = ?", [userEmail]);

        return res.status(200).json({
            success: true,
            message: "Cart cleared."
        });
    } catch (error) {
        console.error("Clear cart error:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to clear cart.",
            error: error.message
        });
    }
};

// Sync local storage lines into database cart upon login
exports.syncCartController = async (req, res) => {
    try {
        const userEmail = req.payload;
        const { lines } = req.body;

        if (Array.isArray(lines)) {
            for (const item of lines) {
                if (item && item.id && item.qty > 0) {
                    const [existing] = await pool.query(
                        "SELECT id, quantity FROM carts WHERE user_email = ? AND product_id = ? LIMIT 1",
                        [userEmail, item.id]
                    );
                    if (existing.length > 0) {
                        const maxQty = Math.max(existing[0].quantity, item.qty);
                        await pool.query("UPDATE carts SET quantity = ? WHERE id = ?", [maxQty, existing[0].id]);
                    } else {
                        await pool.query(
                            "INSERT INTO carts (user_email, product_id, quantity) VALUES (?, ?, ?)",
                            [userEmail, item.id, item.qty]
                        );
                    }
                }
            }
        }

        return res.status(200).json({
            success: true,
            message: "Cart synced successfully."
        });
    } catch (error) {
        console.error("Sync cart error:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to sync cart.",
            error: error.message
        });
    }
};

