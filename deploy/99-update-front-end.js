const { ethers } = require("hardhat")
const fs = require("fs")

const FRONT_END_ADDRESS_FILE =
    "../nextjs-smartcontract-lottery-fcc/constants/contractAddresses.json"
const FRONT_END_ABI_FILE = "../nextjs-smartcontract-lottery-fcc/constants/abi.json"

module.exports = async function () {
    if (process.env.UPDATE_FRONT_END) {
        console.log("Updating Front end...")
        updateContractAddress()
        updateAbi()
    }

    async function updateAbi() {
        const raffle = await ethers.getContract("Raffle")
        fs.writeFileSync(FRONT_END_ABI_FILE, raffle.interface.format(ethers.utils.FormatTypes.json))
    }

    async function updateContractAddress() {
        const raffle = await ethers.getContract("Raffle")
        const chainId = network.config.chainId.toString()
        const currentAddress = JSON.parse(fs.readFileSync(FRONT_END_ADDRESS_FILE, "utf8"))
        if (chainId in currentAddress) {
            if (!currentAddress[chainId].includes(raffle.address)) {
                currentAddress[chainId].push(raffle.address)
            }
        }
        {
            currentAddress[chainId] = [raffle.address]
        }
        fs.writeFileSync(FRONT_END_ADDRESS_FILE, JSON.stringify(currentAddress))
    }
}

module.exports.tags = ["all", "frontend"]
