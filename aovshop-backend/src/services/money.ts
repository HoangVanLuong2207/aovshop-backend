export const MONEY_SCALE = 10;

export function toTenths(value: number): number {
    if (!Number.isFinite(value)) throw new Error('Số tiền không hợp lệ');
    const result = Math.round(value * MONEY_SCALE);
    if (!Number.isSafeInteger(result)) throw new Error('Số tiền vượt giới hạn');
    return result;
}

export function fromTenths(value: number): number {
    if (!Number.isSafeInteger(value)) throw new Error('Đơn vị tiền không hợp lệ');
    return value / MONEY_SCALE;
}

export function storedBalanceTenths(user: { balance: number; balanceTenths?: number | null }): number {
    return user.balanceTenths == null ? toTenths(Number(user.balance || 0)) : Number(user.balanceTenths);
}

export const CHECKPASS_OK_PRICE_TENTHS = 3;
export const CHECKPASS_FAIL_PRICE_TENTHS = 1;
export const CHECKPASS_BLOCK_MINUTES = 30;
export const CHECKPASS_BLOCK_PRICE_TENTHS = 50_000;
const configuredMaxBlocks = Number.parseInt(process.env.CHECKPASS_MAX_BLOCKS || '48', 10);
export const CHECKPASS_MAX_BLOCKS = Number.isSafeInteger(configuredMaxBlocks) && configuredMaxBlocks > 0
    ? configuredMaxBlocks
    : 48;
