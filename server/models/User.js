const NeDB = require('nedb');
const crypto = require('crypto');

const ALGORITHM = 'aes-256-cbc';
const BLOCK_SIZE = 16;
const KEY_SIZE = 32;

const key = 'mYq3t6w9z$C&E)H@McQfTjWnZr4u7x!A';


const User = new NeDB({
    filename: 'users',
    afterSerialization (plaintext) {
        // Encryption

        // Generate random IV.
        const iv = crypto.randomBytes(BLOCK_SIZE)

        // Create cipher from key and IV.
        const cipher = crypto.createCipheriv(ALGORITHM, key, iv)

        // Encrypt record and prepend with IV.
        const ciphertext = Buffer.concat([iv, cipher.update(plaintext), cipher.final()])

        // Encode encrypted record as Base64.
        return ciphertext.toString('base64')
    },

    beforeDeserialization (ciphertext) {
        // Decryption

        // Decode encrypted record from Base64.
        const ciphertextBytes = Buffer.from(ciphertext, 'base64')

        // Get IV from initial bytes.
        const iv = ciphertextBytes.slice(0, BLOCK_SIZE)

        // Get encrypted data from remaining bytes.
        const data = ciphertextBytes.slice(BLOCK_SIZE)

        // Create decipher from key and IV.
        const decipher = crypto.createDecipheriv(ALGORITHM, key, iv)

        // Decrypt record.
        const plaintextBytes = Buffer.concat([decipher.update(data), decipher.final()])

        // Encode record as UTF-8.
        return plaintextBytes.toString()
    },
});
User.loadDatabase();

module.exports = User;