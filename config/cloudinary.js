const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const cloudinary = require('cloudinary').v2;
const fs = require('fs');

// Configure Cloudinary
// It can parse CLOUDINARY_URL or use individual keys
function initCloudinary() {
    const url = process.env.CLOUDINARY_URL || '';
    const isMasked = url.includes('**********');

    if (url && !isMasked) {
        cloudinary.config();
    } else {
        const cloud_name = process.env.CLOUDINARY_CLOUD_NAME || 'pxjqshgq';
        const api_key = process.env.CLOUDINARY_API_KEY || '647744717939513';
        const api_secret = process.env.CLOUDINARY_API_SECRET || '';

        if (api_secret && !api_secret.includes('*')) {
            cloudinary.config({
                cloud_name,
                api_key,
                api_secret,
                secure: true
            });
        }
    }
}

initCloudinary();

/**
 * Check if Cloudinary credentials are fully provided and not masked
 */
function isCloudinaryConfigured() {
    const config = cloudinary.config();
    const secret = config.api_secret || process.env.CLOUDINARY_API_SECRET || '';
    const hasSecret = secret && !secret.includes('*') && secret !== 'YOUR_API_SECRET' && secret !== 'YOUR_ACTUAL_API_SECRET';
    return Boolean(config.cloud_name && config.api_key && hasSecret);
}

/**
 * Upload a local file to Cloudinary
 * @param {string} localFilePath - Path to file saved by multer on disk
 * @param {string} [folder='hubzone/products'] - Target folder in Cloudinary
 * @returns {Promise<string|null>} Secure HTTPS Cloudinary URL or null on failure/fallback
 */
async function uploadProductImage(localFilePath, folder = 'hubzone/products') {
    if (!isCloudinaryConfigured()) {
        console.warn('⚠️ Cloudinary is not fully configured (API Secret missing or masked). Falling back to local storage.');
        return null;
    }

    try {
        const result = await cloudinary.uploader.upload(localFilePath, {
            folder: folder,
            resource_type: 'image',
            use_filename: true,
            unique_filename: true,
            overwrite: false,
        });

        // Clean up temporary local file once successfully uploaded to Cloudinary
        try {
            if (fs.existsSync(localFilePath)) {
                fs.unlinkSync(localFilePath);
            }
        } catch (cleanupErr) {
            console.warn('Notice: Local temp file cleanup error:', cleanupErr.message);
        }

        console.log('✅ Image uploaded to Cloudinary successfully:', result.secure_url);
        return result.secure_url;
    } catch (err) {
        console.error('❌ Cloudinary upload failed:', err.message);
        return null;
    }
}

/**
 * Delete an image from Cloudinary by URL or public ID
 */
async function deleteCloudinaryImage(imageUrl) {
    if (!imageUrl || !imageUrl.includes('res.cloudinary.com')) return;
    if (!isCloudinaryConfigured()) return;

    try {
        // Extract public_id from Cloudinary URL:
        // e.g. https://res.cloudinary.com/pxjqshgq/image/upload/v1234567/hubzone/products/prod-123.jpg
        const match = imageUrl.match(/\/upload\/(?:v\d+\/)?([^\.]+)/);
        if (match && match[1]) {
            const publicId = match[1];
            await cloudinary.uploader.destroy(publicId);
            console.log('🗑️ Deleted image from Cloudinary:', publicId);
        }
    } catch (err) {
        console.warn('Cloudinary delete warning:', err.message);
    }
}

module.exports = {
    cloudinary,
    isCloudinaryConfigured,
    uploadProductImage,
    deleteCloudinaryImage
};
