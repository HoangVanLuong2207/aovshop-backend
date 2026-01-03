// Using Brevo HTTP API instead of SMTP
// Render free tier blocks SMTP ports (587), so we use HTTP API (port 443)

import { db } from '../db/index.js';
import { settings } from '../db/schema.js';
import { eq } from 'drizzle-orm';

interface SendVerificationEmailParams {
    to: string;
    name: string;
    token: string;
}

// Helper to get shop name from database
async function getShopName(): Promise<string> {
    try {
        const result = await db.select().from(settings).where(eq(settings.key, 'shop_name'));
        return result[0]?.value || process.env.SHOP_NAME || 'AOV Shop';
    } catch (error) {
        console.error('Error fetching shop name:', error);
        return process.env.SHOP_NAME || 'AOV Shop';
    }
}

export async function sendVerificationEmail({ to, name, token }: SendVerificationEmailParams): Promise<boolean> {
    const verifyUrl = `${process.env.FRONTEND_URL}/verify-email/${token}`;
    const shopName = await getShopName();

    const htmlContent = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <h1 style="color: #6366f1; text-align: center;">Xác thực Email</h1>
            <p>Xin chào <strong>${name}</strong>,</p>
            <p>Cảm ơn bạn đã đăng ký tài khoản. Vui lòng click vào nút bên dưới để xác thực email của bạn:</p>
            <div style="text-align: center; margin: 30px 0;">
                <a href="${verifyUrl}" 
                   style="background: linear-gradient(135deg, #6366f1, #8b5cf6);
                          color: white;
                          padding: 15px 30px;
                          text-decoration: none;
                          border-radius: 8px;
                          font-weight: bold;
                          display: inline-block;">
                    Xác thực Email
                </a>
            </div>
            <p style="color: #666; font-size: 14px;">
                Hoặc copy link sau vào trình duyệt:<br>
                <a href="${verifyUrl}" style="color: #6366f1;">${verifyUrl}</a>
            </p>
            <p style="color: #999; font-size: 12px;">
                Link này sẽ hết hạn sau 24 giờ. Nếu bạn không yêu cầu đăng ký, vui lòng bỏ qua email này.
            </p>
            <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
            <p style="color: #999; font-size: 12px; text-align: center;">
                © ${new Date().getFullYear()} ${shopName}. All rights reserved.
            </p>
        </div>
    `;

    try {
        console.log('Sending email via Brevo HTTP API to:', to);

        const response = await fetch('https://api.brevo.com/v3/smtp/email', {
            method: 'POST',
            headers: {
                'accept': 'application/json',
                'api-key': process.env.BREVO_API_KEY!,
                'content-type': 'application/json',
            },
            body: JSON.stringify({
                sender: {
                    name: shopName,
                    email: process.env.BREVO_SENDER_EMAIL,
                },
                to: [{ email: to, name }],
                subject: 'Xác thực email của bạn',
                htmlContent,
            }),
        });

        if (!response.ok) {
            const errorData = await response.json();
            console.error('Brevo API error:', errorData);
            return false;
        }

        const result = await response.json() as { messageId?: string };
        console.log(`Verification email sent to ${to}, messageId:`, result.messageId);
        return true;
    } catch (error) {
        console.error('Error sending verification email:', error);
        return false;
    }
}

// Generate random token
export function generateVerificationToken(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let token = '';
    for (let i = 0; i < 64; i++) {
        token += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return token;
}

// Get expiry time (24 hours from now)
export function getVerificationExpiry(): string {
    const expiry = new Date();
    expiry.setHours(expiry.getHours() + 24);
    return expiry.toISOString();
}
