import { and, eq, gte, lt, sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import { transactions } from '../db/schema.js';

const VIETNAM_UTC_OFFSET_MS = 7 * 60 * 60 * 1000;

export type DepositPeriod = 'day' | 'month' | 'year';

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

export const getVietnamDepositRanges = (now = new Date()) => {
    const vietnamTime = new Date(now.getTime() + VIETNAM_UTC_OFFSET_MS);
    const year = vietnamTime.getUTCFullYear();
    const month = vietnamTime.getUTCMonth();
    const day = vietnamTime.getUTCDate();
    return {
        day: {
            start: toUtcIsoFromVietnam(year, month, day),
            end: toUtcIsoFromVietnam(year, month, day + 1),
            label: `${String(day).padStart(2, '0')}/${String(month + 1).padStart(2, '0')}/${year}`,
        },
        month: {
            start: toUtcIsoFromVietnam(year, month, 1),
            end: toUtcIsoFromVietnam(year, month + 1, 1),
            label: `${String(month + 1).padStart(2, '0')}/${year}`,
        },
        year: {
            start: toUtcIsoFromVietnam(year, 0, 1),
            end: toUtcIsoFromVietnam(year + 1, 0, 1),
            label: String(year),
        },
    };
};

export const getDepositStatistic = async (period: DepositPeriod, now = new Date()): Promise<DepositStatistic> => {
    const range = getVietnamDepositRanges(now)[period];
    const [result] = await db.select({
        count: sql<number>`count(*)`,
        amount: sql<number>`coalesce(sum(${transactions.amount}), 0)`,
    }).from(transactions).where(and(
        eq(transactions.type, 'deposit'),
        eq(transactions.status, 'completed'),
        gte(transactions.createdAt, range.start),
        lt(transactions.createdAt, range.end),
    ));
    return {
        period,
        label: range.label,
        start: range.start,
        end: range.end,
        count: Number(result?.count || 0),
        amount: Number(result?.amount || 0),
    };
};

export const getDepositStatistics = async (now = new Date()) => {
    const [day, month, year] = await Promise.all([
        getDepositStatistic('day', now),
        getDepositStatistic('month', now),
        getDepositStatistic('year', now),
    ]);
    return { day, month, year };
};
