import { instance } from '../server.js';
import { createHmac } from 'crypto';
import Subscription from '../models/Subscription.js';
import User from '../models/User.js';

export const preprocessPayment = async (req, res) => {
    const { amount, packageType, userId } = req.body;
    console.log("Payment request:", { amount, packageType, userId });
    
    const options = {
        amount: Number(amount) * 100,
        currency: 'INR',
        receipt: 'receipt_order_id',
    }
    const order = await instance.orders.create(options);
    console.log("Order created:", order);
    res.status(200).json({
        message: "Payment processed successfully",
        order
    });
}

export const getKey = async (req, res) => {
    res.status(200).json({
        key: process.env.RAZORPAY_API_KEY
    });
}

export const paymentVerification = async (req, res) => {
    console.log("Payment verification request:", req.body);

    const {
        razorpay_payment_id: paymentId,
        razorpay_order_id: orderId,
        razorpay_signature: signature,
        userId,
        packageType,
        amount
    } = req.body;

    const body = `${orderId}|${paymentId}`;
    const expectedSignature = createHmac("sha256", process.env.RAZORPAY_API_SECRET)
        .update(body)
        .digest("hex");

    console.log("Payment verification:", {
        expectedSignature,
        receivedSignature: signature,
        isAuthentic: expectedSignature === signature
    });

    if (expectedSignature === signature) {
        try {
            // Calculate subscription end date based on package type
            const endDate = new Date();
            switch (packageType) {
                case 'daily':
                    endDate.setDate(endDate.getDate() + 1);
                    break;
                case 'weekly':
                    endDate.setDate(endDate.getDate() + 7);
                    break;
                case 'monthly':
                    endDate.setMonth(endDate.getMonth() + 1);
                    break;
                case 'yearly':
                    endDate.setFullYear(endDate.getFullYear() + 1);
                    break;
                default:
                    endDate.setMonth(endDate.getMonth() + 1);
            }

            // Create or update subscription
            const subscription = await Subscription.findOneAndUpdate(
                { user: userId },
                {
                    user: userId,
                    plan: packageType,
                    status: 'active',
                    startDate: new Date(),
                    endDate: endDate,
                    paymentId: paymentId,
                    autoRenew: true
                },
                { upsert: true, new: true }
            );

            // Update user's premium status
            await User.findByIdAndUpdate(userId, {
                isPremium: true
            });

            console.log("Subscription created/updated:", subscription);

            return res.redirect(`http://localhost:5173/paymentSuccess?reference=${paymentId}`);
        } catch (error) {
            console.error('Error processing payment:', error);
            return res.status(500).json({
                success: false,
                message: 'Error processing payment'
            });
        }
    } else {
        console.log("Invalid payment signature");
        res.status(400).json({
            success: false,
            message: 'Invalid payment signature'
        });
    }
}

export const getSubscriptionDetails = async (req, res) => {
    try {
        const subscription = await Subscription.findOne({
            user: req.user._id,
            status: 'active',
            endDate: { $gt: new Date() }
        });

        if (!subscription) {
            // Update user's premium status to false if no active subscription
            await User.findByIdAndUpdate(req.user._id, { isPremium: false });
            return res.status(404).json({
                success: false,
                message: 'No active subscription found'
            });
        }

        // Update user's premium status to true
        await User.findByIdAndUpdate(req.user._id, { isPremium: true });

        res.status(200).json({
            success: true,
            endDate: subscription.endDate,
            status: subscription.status
        });
    } catch (error) {
        console.error('Error fetching subscription details:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching subscription details'
        });
    }
};