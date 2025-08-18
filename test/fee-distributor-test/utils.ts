import BigNumber from "bignumber.js";

export function calculateFeeDistribution(amount: string, feeBps: number): { fee1: string, fee2: string } {
    const fee1 = new BigNumber(amount).multipliedBy(new BigNumber(feeBps)).dividedBy(10000).decimalPlaces(0, BigNumber.ROUND_FLOOR).toFixed(0);
    const fee2 = new BigNumber(amount).minus(fee1).toFixed(0);
    return {fee1, fee2};
}