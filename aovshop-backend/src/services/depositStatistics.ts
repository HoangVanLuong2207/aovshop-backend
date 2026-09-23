import { and, eq, gte, lt, sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import { transactions } from '../db/schema.js';

const VIETNAM_UTC_OFFSET_MS = 7 * 60 * 60 * 1000;

export type DepositPeriod = 'day' | 'month' | 'year';
export interface DepositTarget { year: number; month?: number; day?: number; }

export interface DepositStatistic {
    period: DepositPeriod;
    label: string;
    start: string;
    end: string;
    count: number;
    amount: number;
}

const toUtcIsoFromVietnam = (year: number, month: number, day: number) =>
    new Date(Date.UTC(year, month, day) - VIETNAM_UTC_OFFSET_MS).toISOString();

export const getVietnamNowParts = (now = new Date()) => {
    const vietnamTime = new Date(now.getTime() + VIETNAM_UTC_OFFSET_MS);
    return { year: vietnamTime.getUTCFullYear(), month: vietnamTime.getUTCMonth() + 1, day: vietnamTime.getUTCDate() };
};

const assertTarget = (period: DepositPeriod, target: DepositTarget) => {
    if (!Number.isInteger(target.year) || target.year < 2000 || target.year > 2100) throw new Error('Năm không hợp lệ');
    if (period === 'year') return;
    if (!Number.isInteger(target.month) || target.month! < 1 || target.month! > 12) throw new Error('Tháng không hợp lệ');
    if (period === 'month') return;
    if (!Number.isInteger(target.day)) throw new Error('Ngày không hợp lệ');
    const check = new Date(Date.UTC(target.year, target.month! - 1, target.day));
    if (check.getUTCFullYear() !== target.year || check.getUTCMonth() !== target.month! - 1 || check.getUTCDate() !== target.day) throw new Error('Ngày không hợp lệ');
};

export const getVietnamDepositRange = (period: DepositPeriod, target?: DepositTarget, now = new Date()) => {
    const selected = target || getVietnamNowParts(now);
    assertTarget(period, selected);
    const year = selected.year;
    const month = (selected.month || 1) - 1;
    const day = selected.day || 1;
    if (period === 'day') return {
        start: toUtcIsoFromVietnam(year, month, day), end: toUtcIsoFromVietnam(year, month, day + 1),
        label: `${String(day).padStart(2, '0')}/${String(month + 1).padStart(2, '0')}/${year}`,
    };
    if (period === 'month') return {
        start: toUtcIsoFromVietnam(year, month, 1), end: toUtcIsoFromVietnam(year, month + 1, 1),
        label: `${String(month + 1).padStart(2, '0')}/${year}`,
    };
    return { start: toUtcIsoFromVietnam(year, 0, 1), end: toUtcIsoFromVietnam(year + 1, 0, 1), label: String(year) };
};

export const getVietnamDepositRanges = (now = new Date()) => ({
    day: getVietnamDepositRange('day', undefined, now),
    month: getVietnamDepositRange('month', undefined, now),
    year: getVietnamDepositRange('year', undefined, now),
});

export const getDepositStatistic = async (period: DepositPeriod, now = new Date(), target?: DepositTarget): Promise<DepositStatistic> => {
    const range = getVietnamDepositRange(period, target, now);
    const [result] = await db.select({ count: sql<number>`count(*)`, amount: sql<number>`coalesce(sum(${transactions.amount}), 0)` })
        .from(transactions).where(and(eq(transactions.type, 'deposit'), eq(transactions.status, 'completed'), gte(transactions.createdAt, range.start), lt(transactions.createdAt, range.end)));
    return { period, ...range, count: Number(result?.count || 0), amount: Number(result?.amount || 0) };
};

export const getDepositStatistics = async (now = new Date()) => {
    const [day, month, year] = await Promise.all(['day', 'month', 'year'].map(period => getDepositStatistic(period as DepositPeriod, now)));
    return { day, month, year };
};
