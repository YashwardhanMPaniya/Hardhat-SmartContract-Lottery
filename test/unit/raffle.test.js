const { assert, expect } = require("chai")
const { network, deployments, ethers, getNamedAccounts } = require("hardhat")
const { developmentChains, networkConfig } = require("../../helper-hardhat-config")

!developmentChains.includes(network.name)
    ? describe.skip
    : describe("Raffle Unit Tests", function () {
          let raffle, raffleContract, vrfCoordinatorV2Mock, sendValue, interval, player, deployer

          beforeEach(async () => {
              accounts = await ethers.getSigners()
              deployer = (await getNamedAccounts()).deployer
              await deployments.fixture(["mocks", "raffle"]) // Deploys modules with the tags "mocks" and "raffle"
              vrfCoordinatorV2Mock = await ethers.getContract("VRFCoordinatorV2Mock") // Returns a new connection to the VRFCoordinatorV2Mock contract
              raffleContract = await ethers.getContract("Raffle") // Returns a new connection to the Raffle contract
              interval = await raffleContract.getInterval()
              sendValue = networkConfig[network.config.chainId]["raffleEntranceFee"]
          })

          describe("constructor", function () {
              it("initializes the raffle correctly", async () => {
                  const raffleState = (await raffleContract.getRaffleState()).toString()
                  assert.equal(raffleState, "0")
                  const interval = (await raffleContract.getInterval()).toString()
                  const chainId = network.config.chainId
                  assert.equal(interval, networkConfig[chainId]["keepersUpdateInterval"])
              })
          })

          describe("enterRaffle", async () => {
              it("revert if not enough ETH is given", async () => {
                  const sendValue = ethers.utils.parseEther("0.0001")

                  //  await expect(raffleContract.enterRaffle({ value: sendValue }))
                  await expect(raffleContract.enterRaffle()).to.be.reverted
              })

              it("add players to array", async () => {
                  const sendValue = ethers.utils.parseEther("0.01")
                  await raffleContract.enterRaffle({ value: sendValue })
                  const someValue = await raffleContract.getPlayer(0)
                  console.log("deployer - " + deployer)
                  assert.equal(someValue, deployer)
              })

              it("emit correctly", async () => {
                  const sendValue = ethers.utils.parseEther("0.01")

                  await expect(raffleContract.enterRaffle({ value: sendValue })).to.emit(
                      raffleContract,
                      "RaffleEnter"
                  )
              })

              it("cannot enter if rafflestate is calculating", async () => {
                  const sendValue = ethers.utils.parseEther("0.01")
                  await raffleContract.enterRaffle({ value: sendValue })
                  await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
                  await network.provider.request({ method: "evm_mine", params: [] })
                  raffleContract.performUpkeep([])
                  await expect(raffleContract.enterRaffle({ value: sendValue })).to.be.revertedWith(
                      "Raffle_LotteryIsCloseNow"
                  )
              })
          })

          describe("checkUpkeep", async () => {
              it("return false if there in no ETH", async () => {
                  await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
                  await network.provider.send("evm_mine", [])
                  const { upkeepNeeded } = raffleContract.callStatic.checkUpkeep([])
                  console.log(upkeepNeeded)
                  assert(!upkeepNeeded)
              })

              it("return false if raffle state is calculating", async () => {
                  await raffleContract.enterRaffle({ value: sendValue })
                  await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
                  await network.provider.request({ method: "evm_mine", params: [] })
                  raffleContract.performUpkeep([])
                  const raffleState = await raffleContract.getRaffleState()
                  const { upkeepNeeded } = await raffleContract.callStatic.checkUpkeep([])
                  assert.equal(raffleState.toString(), "2")
                  assert.equal(upkeepNeeded, false)
              })
          })

          describe("performUpkeep", async () => {
              it("update the raffles state, emit and event , call the vrfCoordinator", async () => {
                  await raffleContract.enterRaffle({ value: sendValue })
                  await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
                  await network.provider.request({ method: "evm_mine", params: [] })
                  const tx = await raffleContract.performUpkeep([])
                  const receipt = await tx.wait(1)
                  const requestId = await receipt.events[1].args.requestId
                  const raffleState = await raffleContract.getRaffleState()
                  assert(raffleState == 2)
                  assert(requestId > 0)
              })
          })

          describe("fulfillRandomWords", async () => {
              beforeEach(async () => {
                  await raffleContract.enterRaffle({ value: sendValue })
                  await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
                  await network.provider.request({ method: "evm_mine", params: [] })
              })

              it("check if it only run after perform upkeep", async () => {
                  expect(
                      vrfCoordinatorV2Mock.fulfillRandomWords(0, raffleContract.address)
                  ).to.be.revertedWith()
                  expect(
                      vrfCoordinatorV2Mock.fulfillRandomWords(1, raffleContract.address)
                  ).to.be.revertedWith()
              })

              it("test account", async () => {
                  const accounts = await ethers.getSigners()
                  const connectAccount = raffleContract.connect(accounts[1])
                  await connectAccount.enterRaffle({ value: sendValue })

                  const connectAccount1 = raffleContract.connect(accounts[2])
                  await connectAccount.enterRaffle({ value: sendValue })

                  const connectAccount2 = raffleContract.connect(accounts[3])
                  await connectAccount.enterRaffle({ value: sendValue })
              })

              it("picks a winner, reset the lottery and send money", async () => {
                  const numberOfAccounts = 3
                  const startingAccount = 1
                  let startingBalance
                  const accounts = await ethers.getSigners()

                  for (let i = startingAccount; i < startingAccount + numberOfAccounts; i++) {
                      const connectAccount = raffleContract.connect(accounts[i])
                      await connectAccount.enterRaffle({ value: sendValue })
                      //console.log(accounts[i].address + " i=" + i)
                      //0x70997970C51812dc3A010C7d01b50e0d17dc79C8
                  }

                  const startingTimeStamp = raffleContract.getLastTimeStamp()

                  await new Promise(async (resolve, reject) => {
                      raffleContract.once("ListOfWinner", async () => {
                          console.log("Winner Picked")
                          try {
                              const players = await raffleContract.getNumberOfPlayers()
                              const raffleState = await raffleContract.getRaffleState()
                              const recentWinner = await raffleContract.getRecentWinner()
                              const latestTimeStamp = await raffleContract.getLastTimeStamp()
                              const winnerBalance = accounts[1].getBalance()
                              //assert
                              assert.equal(players, 0)
                              assert.equal(raffleState.toString(), "0")
                              assert.equal(recentWinner, accounts[1].address)
                              assert.equal(
                                  winnerBalance.toString(),
                                  startingBalance // startingBalance + ( (raffleEntranceFee * additionalEntrances) + raffleEntranceFee )
                                      .add(sendValue.mul(numberOfAccounts).add(sendValue))
                                      .toString()
                              )
                              assert(latestTimeStamp > startingTimeStamp)
                              resolve()
                          } catch (e) {
                              reject(e)
                          }
                      })
                      try {
                          const tx = await raffleContract.performUpkeep([])
                          const receipt = await tx.wait(1)
                          startingBalance = accounts[1].getBalance()
                          await vrfCoordinatorV2Mock.fulfillRandomWords(
                              receipt.events[1].args.requestId,
                              raffleContract.address
                          )
                      } catch (e) {
                          reject(e)
                      }

                      //promise end here
                  })
              })
          })
      })

/*
      it("picks a winner, resets, and sends money", async () => {
                  const additionalEntrances = 3 // to test
                  const startingIndex = 2
                  let startingBalance
                  for (let i = startingIndex; i < startingIndex + additionalEntrances; i++) { // i = 2; i < 5; i=i+1
                      raffle = raffleContract.connect(accounts[i]) // Returns a new instance of the Raffle contract connected to player
                      await raffle.enterRaffle({ value: raffleEntranceFee })
                  }
                  const startingTimeStamp = await raffle.getLastTimeStamp() // stores starting timestamp (before we fire our event)

                  // This will be more important for our staging tests...
                  await new Promise(async (resolve, reject) => {
                      raffle.once("WinnerPicked", async () => { // event listener for WinnerPicked
                          console.log("WinnerPicked event fired!")
                          // assert throws an error if it fails, so we need to wrap
                          // it in a try/catch so that the promise returns event
                          // if it fails.
                          try {
                              // Now lets get the ending values...
                              const recentWinner = await raffle.getRecentWinner()
                              const raffleState = await raffle.getRaffleState()
                              const winnerBalance = await accounts[2].getBalance()
                              const endingTimeStamp = await raffle.getLastTimeStamp()
                              await expect(raffle.getPlayer(0)).to.be.reverted
                              // Comparisons to check if our ending values are correct:
                              assert.equal(recentWinner.toString(), accounts[2].address)
                              assert.equal(raffleState, 0)
                              assert.equal(
                                  winnerBalance.toString(), 
                                  startingBalance // startingBalance + ( (raffleEntranceFee * additionalEntrances) + raffleEntranceFee )
                                      .add(
                                          raffleEntranceFee
                                              .mul(additionalEntrances)
                                              .add(raffleEntranceFee)
                                      )
                                      .toString()
                              )
                              assert(endingTimeStamp > startingTimeStamp)
                              resolve() // if try passes, resolves the promise 
                          } catch (e) { 
                              reject(e) // if try fails, rejects the promise
                          }
                      })

                      // kicking off the event by mocking the chainlink keepers and vrf coordinator
                      try {
                        const tx = await raffle.performUpkeep("0x")
                        const txReceipt = await tx.wait(1)
                        startingBalance = await accounts[2].getBalance()
                        await vrfCoordinatorV2Mock.fulfillRandomWords(
                            txReceipt.events[1].args.requestId,
                            raffle.address
                        )
                      } catch (e) {
                          reject(e)
                      }
                  })
              })
          })
      */
