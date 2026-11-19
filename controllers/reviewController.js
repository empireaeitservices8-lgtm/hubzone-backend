const pool = require("../config/db");

// Add review for a product (User)
exports.addReviewController = async (req, res) => {
    try {
        const userEmail = req.payload;
        const { productId, rating, comment, username } = req.body;

        if (!productId || !comment) {
            return res.status(400).json({
                success: false,
                message: "Product ID and review comment are required."
            });
        }

        const numRating = parseInt(rating, 10) || 5;
        if (numRating < 1 || numRating > 5) {
            return res.status(400).json({
                success: false,
                message: "Rating must be between 1 and 5 stars."
            });
        }

        // Check if product exists
        const [products] = await pool.query("SELECT id, name FROM products WHERE id = ? LIMIT 1", [productId]);
        if (products.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Product not found."
            });
        }

        // Fetch user's display name if not sent
        let reviewerName = username;
        if (!reviewerName) {
            const [users] = await pool.query("SELECT username FROM users WHERE email = ? LIMIT 1", [userEmail]);
            reviewerName = users.length > 0 ? users[0].username : userEmail.split("@")[0];
        }

        const [result] = await pool.query(
            "INSERT INTO reviews (product_id, user_email, username, rating, comment) VALUES (?, ?, ?, ?, ?)",
            [productId, userEmail, reviewerName, numRating, comment.trim()]
        );

        const [newReview] = await pool.query("SELECT * FROM reviews WHERE id = ?", [result.insertId]);

        return res.status(201).json({
            success: true,
            message: "Thank you! Your review has been added.",
            review: newReview[0]
        });
    } catch (error) {
        console.error("Add review error:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to add review.",
            error: error.message
        });
    }
};

// Get reviews for a specific product (Public)
exports.getProductReviewsController = async (req, res) => {
    try {
        const { productId } = req.params;

        const [reviews] = await pool.query(
            "SELECT id, product_id, user_email, username, rating, comment, created_at FROM reviews WHERE product_id = ? ORDER BY id DESC",
            [productId]
        );

        return res.status(200).json({
            success: true,
            reviews
        });
    } catch (error) {
        console.error("Get product reviews error:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to fetch reviews.",
            error: error.message
        });
    }
};

// Admin: Get all reviews across all products
exports.getAllReviewsController = async (req, res) => {
    try {
        const [reviews] = await pool.query(
            `SELECT r.id, r.product_id, r.user_email, r.username, r.rating, r.comment, r.created_at,
                    p.name as product_name, p.img as product_img, p.cat as product_cat
             FROM reviews r
             LEFT JOIN products p ON r.product_id = p.id
             ORDER BY r.id DESC`
        );

        return res.status(200).json({
            success: true,
            reviews
        });
    } catch (error) {
        console.error("Get all reviews error:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to fetch all reviews.",
            error: error.message
        });
    }
};

// Admin or Author: Delete review
exports.deleteReviewController = async (req, res) => {
    try {
        const { id } = req.params;

        const [rows] = await pool.query("SELECT * FROM reviews WHERE id = ? LIMIT 1", [id]);
        if (rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Review not found."
            });
        }

        const review = rows[0];

        // Check permissions: admin or author
        if (req.role !== 'admin' && req.payload !== review.user_email) {
            return res.status(403).json({
                success: false,
                message: "You are not authorized to delete this review."
            });
        }

        await pool.query("DELETE FROM reviews WHERE id = ?", [id]);

        return res.status(200).json({
            success: true,
            message: "Review deleted successfully."
        });
    } catch (error) {
        console.error("Delete review error:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to delete review.",
            error: error.message
        });
    }
};

