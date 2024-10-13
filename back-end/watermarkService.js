const sharp = require('sharp');
const path = require('path');

const watermarkPath = path.join(__dirname, 'watermark.png');

async function addWatermark(imageBuffer) {
    try {
        
        const imageMetadata = await sharp(imageBuffer).metadata();

        const watermarkBuffer = await sharp(watermarkPath)
            .resize({
                width: Math.floor(imageMetadata.width * 0.3), 
                height: Math.floor(imageMetadata.height * 0.3), 
                fit: 'inside',
            })
            .toBuffer();

        const processedImage = await sharp(imageBuffer)
            .composite([{ input: watermarkBuffer, gravity: 'southeast' }]) 
            .toBuffer();
        
        return processedImage; 
    } catch (error) {
        throw new Error('Error al procesar la imagen: ' + error.message);
    }
}

module.exports = { addWatermark };
