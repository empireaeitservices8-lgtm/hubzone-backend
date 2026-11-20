const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const Razorpay = require('razorpay');

let razorpayInstance = null;

function getRazorpayInstance() {
    const keyId = process.env.RAZORPAY_KEY_ID;
    const keySecret = process.env.RAZORPAY_KEY_SECRET;

    if (!keyId || !keySecret || keyId.includes('YOUR_') || keySecret.includes('YOUR_')) {
        return null;
    }

    if (!razorpayInstance || razorpayInstance.key_id !== keyId) {
        razorpayInstance = new Razorpay({
            key_id: keyId,
            key_secret: keySecret
        });
    }

    return razorpayInstance;
}

function isRazorpayConfigured() {
    const keyId = process.env.RAZORPAY_KEY_ID;
    const keySecret = process.env.RAZORPAY_KEY_SECRET;
    return Boolean(keyId && keySecret && !keyId.includes('YOUR_') && !keySecret.includes('YOUR_'));
}

module.exports = {
    getRazorpayInstance,
    isRazorpayConfigured
};
