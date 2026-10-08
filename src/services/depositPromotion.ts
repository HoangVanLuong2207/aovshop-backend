import { inArray } from 'drizzle-orm';
import { settings } from '../db/schema.js';

export const DEFAULT_MINIMUM_DEPOSIT_AMOUNT = 10_000;
export const MAXIMUM_DEPOSIT_AMOUNT = 1_000_000_000;
export const DEFAULT_CHECKPASS_BONUS_MINIMUM_AMOUNT = 10_000;
export const MAX_CHECKPASS_BONUS_PERCENT = 1_000;

export type DepositPromotionConfig = {
    minimumDepositAmount: number;
    checkpassBonusEnabled: boolean;
    checkpassBonusMinimumAmount: number;
    checkpassBonusPercent: number;
};

function validMoney(value: unknown, fallback: number): number {
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) && parsed > 0 && parsed <= MAXIMUM_DEPOSIT_AMOUNT
        ? parsed
        : fallback;
}

function validPercent(value: unknown): number {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed >= 0 && parsed <= MAX_CHECKPASS_BONUS_PERCENT
        ? Math.round(parsed * 100) / 100
        : 0;
}

export async function getDepositPromotionConfig(database: any): Promise<DepositPromotionConfig> {
    const keys = [
        'minimum_deposit_amount',
        'checkpass_deposit_bonus_enabled',
        'checkpass_deposit_bonus_minimum_amount',
        'checkpass_deposit_bonus_percent',
    ];
    const rows = await database.query.settings.findMany({ where: inArray(settings.key, keys) });
    const values = Object.fromEntries(rows.map((row: any) => [row.key, row.value]));
    return {
        minimumDepositAmount: validMoney(values.minimum_deposit_amount, DEFAULT_MINIMUM_DEPOSIT_AMOUNT),
        checkpassBonusEnabled: ['1', 'true', 'yes', 'on'].includes(String(values.checkpass_deposit_bonus_enabled || '').toLowerCase()),
        checkpassBonusMinimumAmount: validMoney(
            values.checkpass_deposit_bonus_minimum_amount,
            DEFAULT_CHECKPASS_BONUS_MINIMUM_AMOUNT,
        ),
        checkpassBonusPercent: validPercent(values.checkpass_deposit_bonus_percent),
    };
}

export function calculateCheckpassDepositBonusTenths(amount: number, config: DepositPromotionConfig): number {
    if (!config.checkpassBonusEnabled || config.checkpassBonusPercent <= 0 || amount < config.checkpassBonusMinimumAmount) {
        return 0;
    }
    // One unit is 0.1 VND, matching the canonical wallet representation.
    return Math.max(0, Math.round(amount * 10 * config.checkpassBonusPercent / 100));
}

export function publicDepositPromotionConfig(config: DepositPromotionConfig) {
    return {
        minimum_deposit_amount: config.minimumDepositAmount,
        checkpass_deposit_promotion: {
            enabled: config.checkpassBonusEnabled,
            minimum_amount: config.checkpassBonusMinimumAmount,
            bonus_percent: config.checkpassBonusPercent,
        },
    };
}
