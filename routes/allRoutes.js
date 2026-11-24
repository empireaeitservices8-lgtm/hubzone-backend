const express = require('express');
const userController = require('../controllers/userController');
const productController = require('../controllers/productController');
const cartController = require('../controllers/cartController');
const orderController = require('../controllers/orderController');
const reviewController = require('../controllers/reviewController');
const paymentController = require('../controllers/paymentController');
const shiprocketController = require('../controllers/shiprocketController');

const adminMiddleware = require('../middlewares/adminMiddleware');
const jwtMiddleware = require('../middlewares/jwtMiddleware');
const multerMiddleware = require('../middlewares/multerMiddleware');

const router = express.Router();

// Optional JWT middleware for endpoints that can be guest or authenticated
const optionalJwt = (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith("Bearer ")) {
        try {
            const jwt = require("jsonwebtoken");
            const decoded = jwt.verify(authHeader.split(" ")[1], process.env.JWT_SECRET || "hubzone_super_secret_jwt_key_2026_empire");
            req.payload = decoded.email;
            req.userId = decoded.id;
            req.role = decoded.role;
        } catch {
            // Ignore expired/invalid token for optional auth
        }
    }
    next();
};

// ==========================================
// 1. AUTH & USER ROUTES
// ==========================================
router.post('/register', userController.registerController);
router.post('/login', userController.loginController);

// Authenticated User Profile
router.get('/profile', jwtMiddleware, userController.getMyProfileController);
router.put('/profile', jwtMiddleware, userController.updateMyProfileController);

// Admin User Management
router.get('/admin/users', adminMiddleware, userController.getAllUsersController);
router.delete('/admin/users/:id', adminMiddleware, userController.deleteUserController);

// ==========================================
// 2. PRODUCT ROUTES
// ==========================================
router.get('/products', productController.getAllProductsController);
router.get('/product/:id', productController.getProductByIdController);

// Admin Product Management
router.post('/product/add', adminMiddleware, multerMiddleware.single('image'), productController.addProductController);
router.put('/product/:id', adminMiddleware, multerMiddleware.single('image'), productController.updateProductController);
router.delete('/product/:id', adminMiddleware, productController.deleteProductController);

// ==========================================
// 3. CART ROUTES (Authenticated)
// ==========================================
router.get('/cart', jwtMiddleware, cartController.getCartController);
router.post('/cart/add', jwtMiddleware, cartController.addToCartController);
router.put('/cart/update', jwtMiddleware, cartController.updateQuantityController);
router.delete('/cart/remove/:productId', jwtMiddleware, cartController.removeCartItemController);
router.delete('/cart/clear', jwtMiddleware, cartController.clearCartController);
router.post('/cart/sync', jwtMiddleware, cartController.syncCartController);

// ==========================================
// 4. ORDER ROUTES (Authenticated Users Only)
// ==========================================
// Create order (Only logged-in users)
router.post('/order/add', jwtMiddleware, orderController.createOrderController);
router.get('/myOrders', jwtMiddleware, orderController.getMyOrdersController);
router.get('/order/:id', jwtMiddleware, orderController.getOrderByIdController);
router.put('/myOrders/cancel/:id', jwtMiddleware, orderController.cancelMyOrderController);

// Admin Order Management
router.get('/admin/orders', adminMiddleware, orderController.getAllOrdersController);
router.put('/order/status/:id', adminMiddleware, orderController.updateOrderStatusController);
router.delete('/admin/orders/:id', adminMiddleware, orderController.deleteOrderController);

// ==========================================
// 5. REVIEW ROUTES
// ==========================================
router.get('/reviews/:productId', reviewController.getProductReviewsController);
router.post('/review/add', jwtMiddleware, reviewController.addReviewController);

// Admin Review Management
router.get('/admin/reviews', adminMiddleware, reviewController.getAllReviewsController);
router.delete('/review/:id', jwtMiddleware, reviewController.deleteReviewController);

// ==========================================
// 6. PAYMENT ROUTES (Razorpay)
// ==========================================
router.get('/payment/razorpay/config', paymentController.getRazorpayConfigController);
router.post('/payment/razorpay/create-order', jwtMiddleware, paymentController.createRazorpayOrderController);
router.post('/payment/razorpay/verify', jwtMiddleware, paymentController.verifyRazorpayPaymentController);

// ==========================================
// 7. SHIPROCKET SHIPPING ROUTES
// ==========================================
router.get('/shiprocket/serviceability', shiprocketController.checkServiceabilityController);
router.get('/shiprocket/track/:query', shiprocketController.trackOrderController);
router.post('/shiprocket/webhook', shiprocketController.shiprocketWebhookController);
router.get('/admin/shiprocket/config', adminMiddleware, shiprocketController.getConfigController);
router.post('/admin/shiprocket/create-order/:orderId', adminMiddleware, shiprocketController.createShipmentController);
router.post('/admin/shiprocket/assign-awb/:orderId', adminMiddleware, shiprocketController.assignAwbController);

module.exports = router;

