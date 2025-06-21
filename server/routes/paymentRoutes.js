import express from 'express';
import { preprocessPayment, getKey, paymentVerification } from '../controller/productController.js';
const router = express.Router();

router.route('/payment/process').post(preprocessPayment);
router.route('/get-key').get(getKey);
router.route('/paymentVerification').post(paymentVerification)

export default router;


