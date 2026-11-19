const pool = require("../config/db");

// Helper to format product row
function formatProduct(p) {
    if (!p) return null;
    let parsedImages = [];
    try {
        if (typeof p.images === 'string') {
            parsedImages = JSON.parse(p.images);
        } else if (Array.isArray(p.images)) {
            parsedImages = p.images;
        }
    } catch {
        parsedImages = [];
    }
    if (!parsedImages || parsedImages.length === 0) {
        parsedImages = [p.img];
    }

    return {
        id: p.id,
        name: p.name,
        cat: p.cat,
        sub: p.sub,
        price: parseFloat(p.price) || 0,
        offer: p.offer !== null && p.offer !== undefined ? parseFloat(p.offer) : undefined,
        desc: p.desc,
        ingredients: p.ingredients,
        img: p.img,
        images: parsedImages,
        status: p.status || 'in_stock',
        created_at: p.created_at,
        updated_at: p.updated_at
    };
}

// Canonical ordering of products requested by store owner
const CANONICAL_PRODUCT_IDS = [
    // HubCare
    'hair_oil',
    'neelayamari_shampoo',
    'pain_oil',
    'ayurveda_soap',
    'neelayamari',
    'mehandhi',
    'sandal_soap',
    'turmeric_soap',
    'mukhakanthi_soap',
    'mukhakanthi_powder',

    // HubNoir
    'perfumes',
    'fragrances',

    // HubCook
    'dosa_tawa',
    'fry_pan',
    'bowl',

    // HubCof
    'Wayanad-Coffee-125',
    'Wayanad-Coffee-250',
    'Wayanad-Coffee-500',

    // HubWash
    'brass_cleaner',
    'car_wash',
    'liquid_detergent',
    'fabric_stiff',
    'floor_cleaner',
    'hand_wash',
    'toilet_cleaner'
];

const CANONICAL_ID_CASES = CANONICAL_PRODUCT_IDS.map((pid, idx) => `WHEN '${pid}' THEN ${idx + 1}`).join(' ');

// Get all products
exports.getAllProductsController = async (req, res) => {
    try {
        const { search, category, cat, sub, status } = req.query;
        const targetCategory = category || cat;

        let query = "SELECT * FROM products WHERE 1=1";
        const params = [];

        if (targetCategory && targetCategory !== "all" && targetCategory !== "All") {
            query += " AND cat = ?";
            params.push(targetCategory);
        }

        if (sub && sub !== "all") {
            query += " AND sub = ?";
            params.push(sub);
        }

        if (status && status !== "all") {
            query += " AND status = ?";
            params.push(status);
        }

        if (search && search.trim() !== "") {
            const searchTerm = `%${search.trim()}%`;
            query += " AND (name LIKE ? OR `desc` LIKE ? OR cat LIKE ? OR sub LIKE ?)";
            params.push(searchTerm, searchTerm, searchTerm, searchTerm);
        }

        query += ` ORDER BY 
            CASE cat 
                WHEN 'care' THEN 1 
                WHEN 'perfume' THEN 2 
                WHEN 'cook' THEN 3 
                WHEN 'coffee' THEN 4 
                WHEN 'wash' THEN 5 
                ELSE 6 
            END, 
            CASE id 
                ${CANONICAL_ID_CASES} 
                ELSE 100 
            END, 
            created_at ASC`;

        const [rows] = await pool.query(query, params);
        const formatted = rows.map(formatProduct);

        return res.status(200).json(formatted);
    } catch (error) {
        console.error("Get products error:", error);
        return res.status(500).json({
            success: false,
            message: "Unable to fetch products.",
            error: error.message
        });
    }
};

// View single product (including its reviews & avg rating)
exports.getProductByIdController = async (req, res) => {
    try {
        const { id } = req.params;

        const [rows] = await pool.query("SELECT * FROM products WHERE id = ? LIMIT 1", [id]);
        if (rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Product not found."
            });
        }

        const product = formatProduct(rows[0]);

        // Fetch reviews
        const [reviews] = await pool.query(
            "SELECT id, product_id, user_email, username, rating, comment, created_at FROM reviews WHERE product_id = ? ORDER BY id DESC",
            [id]
        );

        let avgRating = 0;
        if (reviews.length > 0) {
            const sum = reviews.reduce((acc, r) => acc + (parseInt(r.rating) || 5), 0);
            avgRating = parseFloat((sum / reviews.length).toFixed(1));
        }

        return res.status(200).json({
            ...product,
            reviews,
            reviewCount: reviews.length,
            averageRating: avgRating
        });
    } catch (error) {
        console.error("View product error:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to fetch product details.",
            error: error.message
        });
    }
};

// Admin: Add new product
exports.addProductController = async (req, res) => {
    try {
        const { id, name, cat, sub, price, offer, desc, ingredients, status, imageUrl } = req.body;

        const imgPath = req.file ? `/uploads/${req.file.filename}` : (imageUrl || req.body.img);

        if (!name || !cat || !price) {
            return res.status(400).json({
                success: false,
                message: "Product name, category, and price are required."
            });
        }

        if (!imgPath) {
            return res.status(400).json({
                success: false,
                message: "Product image is required (either upload a file or provide an image URL/path)."
            });
        }

        // Generate id/slug if not specified
        let productId = (id || "").trim();
        if (!productId) {
            productId = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') + '-' + Date.now().toString().slice(-4);
        }

        // Check if ID already exists
        const [existing] = await pool.query("SELECT id FROM products WHERE id = ? LIMIT 1", [productId]);
        if (existing.length > 0) {
            productId = `${productId}-${Date.now().toString().slice(-4)}`;
        }

        const numPrice = parseFloat(price) || 0.00;
        const numOffer = offer !== undefined && offer !== "" && offer !== null ? parseFloat(offer) : null;
        const productStatus = status === 'out_of_stock' ? 'out_of_stock' : 'in_stock';
        const imagesJson = JSON.stringify([imgPath]);

        await pool.query(
            `INSERT INTO products (id, name, cat, sub, price, offer, \`desc\`, ingredients, img, images, status)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                productId,
                name.trim(),
                cat.trim(),
                sub ? sub.trim() : null,
                numPrice,
                numOffer,
                desc ? desc.trim() : null,
                ingredients ? ingredients.trim() : null,
                imgPath,
                imagesJson,
                productStatus
            ]
        );

        const [created] = await pool.query("SELECT * FROM products WHERE id = ?", [productId]);

        return res.status(201).json({
            success: true,
            message: "Product added successfully!",
            product: formatProduct(created[0])
        });
    } catch (error) {
        console.error("Add product error:", error);
        return res.status(500).json({
            success: false,
            message: "Unable to add product.",
            error: error.message
        });
    }
};

// Admin: Update product details
exports.updateProductController = async (req, res) => {
    try {
        const { id } = req.params;
        const { name, cat, sub, price, offer, desc, ingredients, status, imageUrl } = req.body;

        const [existing] = await pool.query("SELECT * FROM products WHERE id = ? LIMIT 1", [id]);
        if (existing.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Product not found."
            });
        }

        const current = existing[0];
        const newImg = req.file ? `/uploads/${req.file.filename}` : (imageUrl || req.body.img || current.img);
        const newPrice = price !== undefined ? parseFloat(price) : current.price;
        const newOffer = offer !== undefined ? (offer === "" || offer === null ? null : parseFloat(offer)) : current.offer;
        const newStatus = status !== undefined ? status : current.status;

        let newImagesJson;
        if (req.file || imageUrl || req.body.img) {
            newImagesJson = JSON.stringify([newImg]);
        } else if (typeof current.images === "string") {
            newImagesJson = current.images;
        } else if (current.images) {
            newImagesJson = JSON.stringify(current.images);
        } else {
            newImagesJson = JSON.stringify([newImg]);
        }

        await pool.query(
            `UPDATE products 
             SET name = ?, cat = ?, sub = ?, price = ?, offer = ?, \`desc\` = ?, ingredients = ?, img = ?, images = ?, status = ?
             WHERE id = ?`,
            [
                name !== undefined ? name.trim() : current.name,
                cat !== undefined ? cat.trim() : current.cat,
                sub !== undefined ? (sub ? sub.trim() : null) : current.sub,
                newPrice,
                newOffer,
                desc !== undefined ? (desc ? desc.trim() : null) : current.desc,
                ingredients !== undefined ? (ingredients ? ingredients.trim() : null) : current.ingredients,
                newImg,
                newImagesJson,
                newStatus,
                id
            ]
        );

        const [updated] = await pool.query("SELECT * FROM products WHERE id = ?", [id]);

        return res.status(200).json({
            success: true,
            message: "Product updated successfully!",
            product: formatProduct(updated[0])
        });
    } catch (error) {
        console.error("Update product error:", error);
        return res.status(500).json({
            success: false,
            message: "Unable to update product.",
            error: error.message
        });
    }
};

// Admin: Delete product
exports.deleteProductController = async (req, res) => {
    try {
        const { id } = req.params;

        const [existing] = await pool.query("SELECT * FROM products WHERE id = ? LIMIT 1", [id]);
        if (existing.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Product not found."
            });
        }

        await pool.query("DELETE FROM products WHERE id = ?", [id]);

        return res.status(200).json({
            success: true,
            message: `Product '${existing[0].name}' deleted successfully.`
        });
    } catch (error) {
        console.error("Delete product error:", error);
        return res.status(500).json({
            success: false,
            message: "Unable to delete product.",
            error: error.message
        });
    }
};

