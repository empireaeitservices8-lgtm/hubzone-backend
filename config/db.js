const mysql = require('mysql2/promise');
const bcrypt = require('bcrypt');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

let targetDatabase = process.env.DB_NAME || 'hubzone_db';
let poolConfig;

if (process.env.DATABASE_URL) {
    try {
        const parsed = new URL(process.env.DATABASE_URL);
        const pathDb = parsed.pathname ? parsed.pathname.replace(/^\//, '') : '';
        if (pathDb && pathDb !== 'sys') {
            targetDatabase = pathDb;
        }
        poolConfig = {
            host: parsed.hostname,
            port: Number(parsed.port) || 3306,
            user: decodeURIComponent(parsed.username),
            password: decodeURIComponent(parsed.password),
            database: targetDatabase,
            waitForConnections: true,
            connectionLimit: 10,
            queueLimit: 0,
            ssl: { minVersion: 'TLSv1.2', rejectUnauthorized: true }
        };
    } catch {
        poolConfig = {
            uri: process.env.DATABASE_URL,
            waitForConnections: true,
            connectionLimit: 10,
            queueLimit: 0,
            ssl: { minVersion: 'TLSv1.2', rejectUnauthorized: true }
        };
    }
} else {
    poolConfig = {
        host: process.env.DB_HOST || 'localhost',
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '',
        database: targetDatabase,
        port: Number(process.env.DB_PORT) || 3306,
        waitForConnections: true,
        connectionLimit: 10,
        queueLimit: 0,
        ssl: process.env.DB_SSL === 'true' ? { minVersion: 'TLSv1.2', rejectUnauthorized: true } : undefined
    };
}

const pool = mysql.createPool(poolConfig);

const INITIAL_PRODUCTS = [
  {
    id: "hair_oil",
    name: "Hair Oil 100 ml",
    cat: "care",
    sub: "hair-care",
    price: 550.00,
    offer: 499.00,
    desc: "Vasabringamalakadi Herbal Hair Oil is a premium Ayurvedic blend designed to nourish the scalp, strengthen roots, and improve overall hair health. Made under GMP & ISO-certified standards, it delivers a natural solution for stronger, shinier, and healthier hair. The key benefits are ✔️Clears dandruff & improves scalp health ✔️Adds volume & revitalizes hair ✔️Repairs damaged hair and Enhances shine & luster",
    ingredients: "Kushta (Saussurea lappa), Vasa (Adhatoda vasica), Yashti (Glycyrrhiza glabra), Marica (Piper nigrum), Pippali (Piper longum), Bhringaraja (Eclipta alba), Amalaki (Emblica officinalis)",
    img: "/products/hair_oil.jpeg",
    images: JSON.stringify(["/products/hair_oil.jpeg", "/products/hair_oil2.jpeg"])
  },
  {
    id: "neelayamari_shampoo",
    name: "Neelayamari Shampoo 120 ml",
    cat: "care",
    sub: "hair-care",
    price: 329.00,
    offer: 295.00,
    desc: "Neelayamari Shampoo is a herbal hair wash from HubCare, inspired by the traditional Ayurvedic use of Neelayamari. It cleanses the scalp gently and leaves hair feeling fresh and soft.",
    ingredients: null,
    img: "/products/neelayamari_shampoo.jpeg",
    images: JSON.stringify(["/products/neelayamari_shampoo.jpeg", "/products/neelayamari_shampoo2.jpeg"])
  },
  {
    id: "pain_oil",
    name: "Pain Oil 100 ml",
    cat: "care",
    sub: "pain-relief",
    price: 540.00,
    offer: 495.00,
    desc: "Herbal Pain Oil by Hub Care Group of Ayurveda is a specially formulated Ayurvedic blend designed to provide effective relief from joint and muscular discomfort naturally. Enriched with traditional Ayurvedic oils and herbal extracts, this formulation helps soothe pain, reduce inflammation, and improve mobility. Its fast-absorbing herbal composition supports muscle relaxation and promotes comfort in affected areas, making it an ideal solution for everyday body aches and stiffness.",
    ingredients: "Mahanarayana Thailam, Kottamchukkadi Thailam, Thushka, Karpoora (Camphor), Eucalyptus Oil, Lemongrass Oil",
    img: "/products/pain_oil.jpeg",
    images: JSON.stringify(["/products/pain_oil.jpeg"])
  },
  {
    id: "ayurveda_soap",
    name: "Ayurveda Soap 100 gm",
    cat: "care",
    sub: "skin-body",
    price: 199.00,
    offer: 175.00,
    desc: "HUBCARE Ayurveda Soap is a traditional herbal soap crafted with natural Ayurvedic ingredients for gentle cleansing and daily skin care. Made with a blend of herbs and natural extracts, it helps refresh and nourish the skin while maintaining cleanliness.",
    ingredients: "Coconut Oil, Coconut Cake, Turmeric, Ramacham, Green Gram, Karchura, Chitalam, Elaneergam, Water",
    img: "/products/ayurveda_soap.jpeg",
    images: JSON.stringify(["/products/ayurveda_soap.jpeg"])
  },
  {
    id: "neelayamari",
    name: "Neelayamari Podi 100 gm",
    cat: "care",
    sub: "hair-care",
    price: 355.00,
    offer: 325.00,
    desc: "Natural Ayurvedic herbal powder made from Neelayamari for complete hair care support. The key benefits are ✔️ Supports healthy hair growth ✔️ Helps reduce hair fall ✔️ Helps control dandruff ✔️ Nourishes scalp and hair roots ✔️ Supports stronger and healthier hair",
    ingredients: null,
    img: "/products/neelayamari.jpeg",
    images: JSON.stringify(["/products/neelayamari.jpeg"])
  },
  {
    id: "mehandhi",
    name: "Mehandhi 100 gm",
    cat: "care",
    sub: "hair-care",
    price: 339.00,
    offer: 310.00,
    desc: "HUB Care Group Mylanchi Powder is a natural herbal hair care powder prepared from quality Mylanchi (Henna) ingredients. Traditionally used for hair nourishment and scalp care, this herbal powder helps maintain healthier-looking hair while providing a natural conditioning effect.",
    ingredients: null,
    img: "/products/mehandhi.jpeg",
    images: JSON.stringify(["/products/mehandhi.jpeg"])
  },
  {
    id: "sandal_soap",
    name: "Natural Skin Care Soap 75 gm",
    cat: "care",
    sub: "skin-body",
    price: 110.00,
    offer: null,
    desc: "A natural skin care soap from HubCare for gentle daily cleansing. It leaves the skin feeling clean, fresh and soft.",
    ingredients: null,
    img: "/products/sandal_soap.jpeg",
    images: JSON.stringify(["/products/sandal_soap.jpeg", "/products/sandal_soap2.jpeg"])
  },
  {
    id: "turmeric_soap",
    name: "Turmeric Soap 75 gm",
    cat: "care",
    sub: "skin-body",
    price: 99.00,
    offer: null,
    desc: "A herbal soap made with the traditional goodness of turmeric. A simple, gentle bath soap for everyday use.",
    ingredients: null,
    img: "/products/turmeric_soap.jpeg",
    images: JSON.stringify(["/products/turmeric_soap.jpeg", "/products/turmeric_soap2.jpeg"])
  },
  {
    id: "mukhakanthi_soap",
    name: "Mughakanthi Soap 75 gm",
    cat: "care",
    sub: "skin-body",
    price: 110.00,
    offer: null,
    desc: "Mukhakanthi Soap is an Ayurvedic-style soap from HubCare for daily face and body care. It cleanses gently and leaves the skin fresh.",
    ingredients: null,
    img: "/products/mukhakanthi_soap.jpeg",
    images: JSON.stringify(["/products/mukhakanthi_soap.jpeg", "/products/mukhakanthi_soap2.jpeg"])
  },
  {
    id: "mukhakanthi_powder",
    name: "Mukhakanthi Powder",
    cat: "care",
    sub: "skin-body",
    price: 320.00,
    offer: 290.00,
    desc: "A fine herbal powder from HubCare for traditional face care. Mix it with water, rose water or milk and use it as part of your regular skin care routine.",
    ingredients: null,
    img: "/products/mukhakanthi_powder.jpeg",
    images: JSON.stringify(["/products/mukhakanthi_powder.jpeg", "/products/mukhakanthi2.jpeg"])
  },
  {
    id: "perfumes",
    name: "Perfumes 50 ml",
    cat: "perfume",
    sub: "perfumes",
    price: 699.00,
    offer: 599.00,
    desc: "A signature perfume from HubNoir with bold, long-lasting notes. Made for every mood and occasion, in a 50 ml bottle.",
    ingredients: null,
    img: "/products/perfumes.webp",
    images: JSON.stringify(["/products/perfumes.webp", "/products/perfumes2.jpeg"])
  },
  {
    id: "fragrances",
    name: "Fragrances 50 ml",
    cat: "perfume",
    sub: "perfumes",
    price: 699.00,
    offer: 599.00,
    desc: "A rich, lasting fragrance from HubNoir that stays with you through the day. Comes in a 50 ml bottle.",
    ingredients: null,
    img: "/products/fragrances.webp",
    images: JSON.stringify(["/products/fragrances.webp"])
  },
  {
    id: "dosa_tawa",
    name: "Dosa Tawa",
    cat: "cook",
    sub: "cookware",
    price: 1499.00,
    offer: 1200.00,
    desc: "A sturdy dosa tawa from HubCook for crisp, evenly cooked dosas and rotis. Built for everyday use in the kitchen.",
    ingredients: null,
    img: "/products/dosa_tawa.webp",
    images: JSON.stringify(["/products/dosa_tawa.webp"])
  },
  {
    id: "fry_pan",
    name: "Triply Fry Pan",
    cat: "cook",
    sub: "cookware",
    price: 2200.00,
    offer: 1999.00,
    desc: "A triply fry pan from HubCook for everyday frying and sautéing. Heats evenly and is made to last.",
    ingredients: null,
    img: "/products/fry_pan.webp",
    images: JSON.stringify(["/products/fry_pan.webp"])
  },
  {
    id: "bowl",
    name: "Uro Bowl",
    cat: "cook",
    sub: "bowls",
    price: 799.00,
    offer: 700.00,
    desc: "The Uro Bowl from HubCook is a practical kitchen bowl for mixing, serving and storing. Easy to use every day.",
    ingredients: null,
    img: "/products/bowl.webp",
    images: JSON.stringify(["/products/bowl.webp"])
  },
  {
    id: "Wayanad-Coffee-125",
    name: "Wayanad Coffee (125g)",
    cat: "coffee",
    sub: "wayanad-coffee",
    price: 150.00,
    offer: null,
    desc: "100% pure Wayanad coffee from HubCof in a 125 g pack. No chicory and no fillers, just rich aroma and bold taste.",
    ingredients: null,
    img: "/products/Wayanad-Coffee-125.webp",
    images: JSON.stringify(["/products/Wayanad-Coffee-125.webp"])
  },
  {
    id: "Wayanad-Coffee-250",
    name: "Wayanad Coffee (250g)",
    cat: "coffee",
    sub: "wayanad-coffee",
    price: 299.00,
    offer: null,
    desc: "100% pure Wayanad coffee from HubCof in a 250 g pack. No chicory and no fillers, just rich aroma and bold taste.",
    ingredients: null,
    img: "/products/Wayanad-Coffee-250.webp",
    images: JSON.stringify(["/products/Wayanad-Coffee-250.webp"])
  },
  {
    id: "Wayanad-Coffee-500",
    name: "Wayanad Coffee (500g)",
    cat: "coffee",
    sub: "wayanad-coffee",
    price: 599.00,
    offer: null,
    desc: "100% pure Wayanad coffee from HubCof in a 500 g pack. No chicory and no fillers, just rich aroma and bold taste. A good size for the whole family.",
    ingredients: null,
    img: "/products/Wayanad-Coffee-500.webp",
    images: JSON.stringify(["/products/Wayanad-Coffee-500.webp"])
  },
  {
    id: "brass_cleaner",
    name: "Brass Cleaner",
    cat: "wash",
    sub: "home-cleaning",
    price: 155.00,
    offer: 130.00,
    desc: "A brass cleaner from HubWash that helps remove tarnish and bring back the shine of brass utensils and lamps.",
    ingredients: null,
    img: "/products/brass_cleaner.webp",
    images: JSON.stringify(["/products/brass_cleaner.webp"])
  },
  {
    id: "car_wash",
    name: "Car Wash",
    cat: "wash",
    sub: "car-hand-wash",
    price: 145.00,
    offer: 120.00,
    desc: "A car wash liquid from HubWash that helps lift dirt and dust from your vehicle and leaves a clean finish.",
    ingredients: null,
    img: "/products/car_wash.webp",
    images: JSON.stringify(["/products/car_wash.webp"])
  },
  {
    id: "liquid_detergent",
    name: "Detergent Liquid",
    cat: "wash",
    sub: "laundry",
    price: 155.00,
    offer: 135.00,
    desc: "A liquid laundry detergent from HubWash that helps remove dirt and stains and leaves clothes fresh.",
    ingredients: null,
    img: "/products/liquid_detergent.webp",
    images: JSON.stringify(["/products/liquid_detergent.webp"])
  },
  {
    id: "fabric_stiff",
    name: "Fabric Stiff",
    cat: "wash",
    sub: "laundry",
    price: 110.00,
    offer: 85.00,
    desc: "A fabric stiffener from HubWash that gives cotton clothes and sarees a crisp, neat finish.",
    ingredients: null,
    img: "/products/fabric_stiff.webp",
    images: JSON.stringify(["/products/fabric_stiff.webp"])
  },
  {
    id: "floor_cleaner",
    name: "Floor Cleaner",
    cat: "wash",
    sub: "home-cleaning",
    price: 145.00,
    offer: 125.00,
    desc: "A floor cleaner from HubWash that helps clean and freshen floors, leaving them spotless and pleasantly scented.",
    ingredients: null,
    img: "/products/floor_cleaner.webp",
    images: JSON.stringify(["/products/floor_cleaner.webp"])
  },
  {
    id: "hand_wash",
    name: "Hand Wash",
    cat: "wash",
    sub: "car-hand-wash",
    price: 135.00,
    offer: 110.00,
    desc: "A hand wash from HubWash that cleans hands gently and leaves them feeling fresh.",
    ingredients: null,
    img: "/products/hand_wash.webp",
    images: JSON.stringify(["/products/hand_wash.webp"])
  },
  {
    id: "toilet_cleaner",
    name: "Toilet Cleaner",
    cat: "wash",
    sub: "home-cleaning",
    price: 140.00,
    offer: 120.00,
    desc: "A toilet cleaner from HubWash that helps remove stains and keeps the bowl clean and hygienic.",
    ingredients: null,
    img: "/products/toilet_cleaner.webp",
    images: JSON.stringify(["/products/toilet_cleaner.webp"])
  }
];

async function initDB() {
    try {
        const connection = await pool.getConnection();
        console.log("MySQL / TiDB Database connected successfully to:", targetDatabase);

        // 1. Users table
        await connection.query(`
            CREATE TABLE IF NOT EXISTS users (
                id INT AUTO_INCREMENT PRIMARY KEY,
                username VARCHAR(255) NOT NULL,
                email VARCHAR(255) NOT NULL UNIQUE,
                password VARCHAR(255) NOT NULL,
                phone VARCHAR(50) NOT NULL,
                address TEXT NULL,
                city VARCHAR(150) NULL,
                state VARCHAR(150) NULL,
                pin VARCHAR(50) NULL,
                role ENUM('user', 'admin') DEFAULT 'user',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        `);

        // 2. Products table
        await connection.query(`
            CREATE TABLE IF NOT EXISTS products (
                id VARCHAR(100) PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                cat VARCHAR(50) NOT NULL,
                sub VARCHAR(100) NULL,
                price DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
                offer DECIMAL(10, 2) NULL,
                \`desc\` TEXT NULL,
                ingredients TEXT NULL,
                img VARCHAR(500) NOT NULL,
                images JSON NULL,
                status ENUM('in_stock', 'out_of_stock') DEFAULT 'in_stock',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        `);

        // 3. Reviews table
        await connection.query(`
            CREATE TABLE IF NOT EXISTS reviews (
                id INT AUTO_INCREMENT PRIMARY KEY,
                product_id VARCHAR(100) NOT NULL,
                user_email VARCHAR(255) NOT NULL,
                username VARCHAR(255) NOT NULL,
                rating INT NOT NULL DEFAULT 5,
                comment TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        `);

        // 4. Carts table
        await connection.query(`
            CREATE TABLE IF NOT EXISTS carts (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_email VARCHAR(255) NOT NULL,
                product_id VARCHAR(100) NOT NULL,
                quantity INT NOT NULL DEFAULT 1,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                UNIQUE KEY unique_user_product (user_email, product_id),
                FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        `);

        // 5. Orders table
        await connection.query(`
            CREATE TABLE IF NOT EXISTS orders (
                id INT AUTO_INCREMENT PRIMARY KEY,
                order_number VARCHAR(50) NOT NULL UNIQUE,
                user_email VARCHAR(255) NOT NULL,
                username VARCHAR(255) NOT NULL,
                phone VARCHAR(50) NOT NULL,
                address TEXT NOT NULL,
                city VARCHAR(100) NULL,
                state VARCHAR(100) NULL,
                pin VARCHAR(20) NULL,
                payment_method VARCHAR(100) DEFAULT 'Cash on Delivery',
                payment_status VARCHAR(50) DEFAULT 'Pending',
                razorpay_order_id VARCHAR(100) NULL,
                razorpay_payment_id VARCHAR(100) NULL,
                order_status ENUM('Placed', 'Shipped', 'Delivered', 'Cancelled') DEFAULT 'Placed',
                subtotal DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
                delivery_fee DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
                total_amount DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
                items_json JSON NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        `);

        // Ensure razorpay columns exist if table was already created earlier
        await connection.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_status VARCHAR(50) DEFAULT 'Pending'`).catch(() => {});
        await connection.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS razorpay_order_id VARCHAR(100) NULL`).catch(() => {});
        await connection.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS razorpay_payment_id VARCHAR(100) NULL`).catch(() => {});

        // Check if admin user exists, if not create default admin
        const adminEmail = (process.env.ADMIN_EMAIL || 'admin@hubzone.com').toLowerCase();
        const [adminRows] = await connection.query(`SELECT * FROM users WHERE role = 'admin' LIMIT 1`);
        if (adminRows.length === 0) {
            const adminPass = await bcrypt.hash(process.env.ADMIN_PASSWORD || 'admin123', 10);
            await connection.query(
                `INSERT INTO users (username, email, password, phone, role) VALUES (?, ?, ?, ?, 'admin')`,
                ['HubZone Admin', adminEmail, adminPass, process.env.ADMIN_PHONE || '9876543210']
            );
            console.log(`Default admin account created: ${adminEmail} / admin123`);
        }

        // Check if existing products are seeded
        const [productRows] = await connection.query(`SELECT COUNT(*) as cnt FROM products`);
        if (productRows[0].cnt === 0) {
            console.log("Seeding all existing HubZone products into database...");
            for (const p of INITIAL_PRODUCTS) {
                await connection.query(
                    `INSERT INTO products (id, name, cat, sub, price, offer, \`desc\`, ingredients, img, images, status) 
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'in_stock')`,
                    [p.id, p.name, p.cat, p.sub, p.price, p.offer, p.desc, p.ingredients, p.img, p.images]
                );
            }
            console.log(`Seeded ${INITIAL_PRODUCTS.length} initial products successfully.`);
        }

        connection.release();
    } catch (err) {
        console.error("Database connection / initialization failed:", err);
    }
}

initDB();

module.exports = pool;

