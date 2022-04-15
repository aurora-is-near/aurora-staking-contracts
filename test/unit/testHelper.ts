import { ethers } from "hardhat";

export async function getEventLogs(
    txHash: string,
    event: string[],
    logIndex: number
): Promise<any> {
    const iface = new ethers.utils.Interface(event)
    const receipt = await ethers.provider.getTransactionReceipt(txHash)
    const log = iface.parseLog(receipt.logs[logIndex])
    return log.args
}