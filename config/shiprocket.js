const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const SHIPROCKET_API_BASE = 'https://apiv2.shiprocket.in/v2/console';

let cachedToken = null;
let tokenExpiresAt = 0;

function isShiprocketConfigured() {
    const email = process.env.SHIPROCKET_EMAIL || '';
    const password = process.env.SHIPROCKET_PASSWORD || '';
    return Boolean(email && password && !email.includes('your_') && !password.includes('your_'));
}

/**
 * Obtain or reuse cached Shiprocket JWT auth token
 */
async function getAuthToken() {
    const email = process.env.SHIPROCKET_EMAIL;
    const password = process.env.SHIPROCKET_PASSWORD;

    if (!email || !password) {
        throw new Error('Shiprocket credentials (SHIPROCKET_EMAIL, SHIPROCKET_PASSWORD) are not set in .env.');
    }

    // Reuse token if still valid (valid for 10 days, we refresh at 9 days)
    const now = Date.now();
    if (cachedToken && now < tokenExpiresAt) {
        return cachedToken;
    }

    const response = await fetch(`${SHIPROCKET_API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok || !data.token) {
        throw new Error(data.message || 'Shiprocket authentication failed. Please verify SHIPROCKET_EMAIL and SHIPROCKET_PASSWORD.');
    }

    cachedToken = data.token;
    // Set expiry to 9 days from now
    tokenExpiresAt = now + 9 * 24 * 60 * 60 * 1000;
    return cachedToken;
}

/**
 * Create an order/shipment in Shiprocket
 * @param {Object} order - Local database order object
 */
async function createShiprocketOrder(order) {
    const token = await getAuthToken();
    const pickupLocation = process.env.SHIPROCKET_PICKUP_LOCATION || 'Primary';

    const orderDate = new Date(order.createdAt || Date.now())
        .toISOString()
        .slice(0, 16)
        .replace('T', ' ');

    const nameParts = (order.username || 'Customer').trim().split(' ');
    const firstName = nameParts[0] || 'Customer';
    const lastName = nameParts.slice(1).join(' ') || 'Customer';

    const items = (order.items || []).map((it, idx) => ({
        name: it.name || `Product ${idx + 1}`,
        sku: it.id ? String(it.id).slice(0, 30) : `SKU-${idx + 1}`,
        units: parseInt(it.qty || it.quantity, 10) || 1,
        selling_price: parseFloat(it.price || it.effectivePrice || 0),
        discount: 0,
        tax: 0
    }));

    const isCod = String(order.paymentMethod || '').toLowerCase().includes('cash');

    const payload = {
        order_id: String(order.orderNumber || order.id),
        order_date: orderDate,
        pickup_location: pickupLocation,
        billing_customer_name: firstName,
        billing_last_name: lastName,
        billing_address: order.address || 'Address not provided',
        billing_city: order.city || 'Kochi',
        billing_pincode: String(order.pin || '682001'),
        billing_state: order.state || 'Kerala',
        billing_country: 'India',
        billing_email: order.userEmail || 'customer@hubzone.in',
        billing_phone: String(order.phone || '9999999999').replace(/\D/g, '').slice(-10),
        shipping_is_billing: true,
        order_items: items.length > 0 ? items : [{
            name: 'HubZone Products',
            sku: 'HZ-GEN',
            units: 1,
            selling_price: parseFloat(order.totalAmount || 100)
        }],
        payment_method: isCod ? 'COD' : 'Prepaid',
        sub_total: parseFloat(order.subtotal || order.totalAmount || 0),
        length: 10,
        breadth: 10,
        height: 10,
        weight: 0.5
    };

    const response = await fetch(`${SHIPROCKET_API_BASE}/orders/create/adhoc`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(payload)
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
        throw new Error(data.message || JSON.stringify(data.errors) || 'Failed to create order in Shiprocket.');
    }

    return data;
}

/**
 * Assign courier & generate AWB code
 * @param {string|number} shipmentId
 * @param {number} [courierId] - Optional specific courier company ID
 */
async function assignAwb(shipmentId, courierId = null) {
    const token = await getAuthToken();

    const body = { shipment_id: shipmentId };
    if (courierId) {
        body.courier_id = courierId;
    }

    const response = await fetch(`${SHIPROCKET_API_BASE}/courier/assign/awb`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(body)
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
        throw new Error(data.message || 'Failed to assign AWB in Shiprocket.');
    }

    return data;
}

/**
 * Track shipment by AWB code
 * @param {string} awbCode
 */
async function trackShipment(awbCode) {
    const token = await getAuthToken();

    const response = await fetch(`${SHIPROCKET_API_BASE}/courier/track/awb/${encodeURIComponent(awbCode)}`, {
        method: 'GET',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        }
    });

    const data = await response.json().catch(() => ({}));
    return data;
}

/**
 * Check courier serviceability for a delivery pincode
 */
async function checkServiceability(deliveryPin, weight = 0.5, isCod = false) {
    const token = await getAuthToken();
    const pickupPin = process.env.SHIPROCKET_PICKUP_PINCODE || '682021'; // Default HubZone Kerala pincode

    const codParam = isCod ? 1 : 0;
    const url = `${SHIPROCKET_API_BASE}/courier/serviceability/?pickup_postcode=${pickupPin}&delivery_postcode=${encodeURIComponent(deliveryPin)}&weight=${weight}&cod=${codParam}`;

    const response = await fetch(url, {
        method: 'GET',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        }
    });

    const data = await response.json().catch(() => ({}));
    return data;
}

module.exports = {
    isShiprocketConfigured,
    getAuthToken,
    createShiprocketOrder,
    assignAwb,
    trackShipment,
    checkServiceability
};
