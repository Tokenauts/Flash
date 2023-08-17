import { ethers } from "ethers";
import {
  UiPoolDataProvider,
  UiIncentiveDataProvider,
  ChainId,
} from "@aave/contract-helpers";
import * as markets from "@bgd-labs/aave-address-book";
import Web3 from "web3";
import abi from "./abi/Pool.json" assert { type: "json" };
import { formatUserSummary, formatReserves } from "@aave/math-utils";
import dayjs from "dayjs";
import express from "express";
import cors from "cors";
import fs from "fs";
import path, { parse } from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";
import AD from "./addresses.json" assert { type: "json" };
import UF from "./useful.json" assert { type: "json" };
import UD from "./userData.json" assert { type: "json" };
import WL from "./watchlist.json" assert { type: "json" };

const app = express();
const port = 3006;
app.use(cors());
const provider = new ethers.providers.JsonRpcProvider(
  "https://eth-mainnet.public.blastapi.io"
);

//const currentAccount = '0x464C71f6c2F760DdA6093dCB91C24c39e5d6e18c';

const poolDataProviderContract = new UiPoolDataProvider({
  uiPoolDataProviderAddress: markets.AaveV3Ethereum.UI_POOL_DATA_PROVIDER,
  provider,
  chainId: ChainId.mainnet,
});

const incentiveDataProviderContract = new UiIncentiveDataProvider({
  uiIncentiveDataProviderAddress:
    markets.AaveV3Ethereum.UI_INCENTIVE_DATA_PROVIDER,
  provider,
  chainId: ChainId.mainnet,
});

async function fetchContractData(currentAccount) {
  const reserves = await poolDataProviderContract.getReservesHumanized({
    lendingPoolAddressProvider: markets.AaveV3Ethereum.POOL_ADDRESSES_PROVIDER,
  });

  // Object containing array or users aave positions and active eMode category
  // { userReserves, userEmodeCategoryId }
  const userReserves = await poolDataProviderContract.getUserReservesHumanized({
    lendingPoolAddressProvider: markets.AaveV3Ethereum.POOL_ADDRESSES_PROVIDER,
    user: currentAccount,
  });

  // Array of incentive tokens with price feed and emission APR
  const reserveIncentives =
    await incentiveDataProviderContract.getReservesIncentivesDataHumanized({
      lendingPoolAddressProvider:
        markets.AaveV3Ethereum.POOL_ADDRESSES_PROVIDER,
    });

  // Dictionary of claimable user incentives
  const userIncentives =
    await incentiveDataProviderContract.getUserReservesIncentivesDataHumanized({
      lendingPoolAddressProvider:
        markets.AaveV3Ethereum.POOL_ADDRESSES_PROVIDER,
      user: currentAccount,
    });

  const reservesArray = reserves.reservesData;
  const baseCurrencyData = reserves.baseCurrencyData;
  const userReservesArray = userReserves.userReserves;

  const currentTimestamp = dayjs().unix();

  const formattedPoolReserves = await formatReserves({
    reserves: reservesArray,
    currentTimestamp,
    marketReferenceCurrencyDecimals:
      baseCurrencyData.marketReferenceCurrencyDecimals,
    marketReferencePriceInUsd:
      baseCurrencyData.marketReferenceCurrencyPriceInUsd,
  });
  const userSummary = formatUserSummary({
    currentTimestamp,
    marketReferencePriceInUsd:
      baseCurrencyData.marketReferenceCurrencyPriceInUsd,
    marketReferenceCurrencyDecimals:
      baseCurrencyData.marketReferenceCurrencyDecimals,
    userReserves: userReservesArray,
    formattedReserves: formattedPoolReserves,
    userEmodeCategoryId: userReserves.userEmodeCategoryId,
  });
  const imp = userSummary.userReservesData;
  imp.forEach((im) => {
    delete im.reserve;
  });
  console.log("Summary Is:", imp);
  return imp;
}

const addresses = [];
const data = [];
const useful = [];

const web3 = new Web3(
  "https://mainnet.infura.io/v3/b4d5f8243b484669b69913d1062982b9"
);
const contractAddress = "0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2";

const contractABI = abi.abi;
const contract = new web3.eth.Contract(contractABI, contractAddress);
function saveDataToFile(filename, content) {
  fs.writeFileSync(filename, JSON.stringify(content, null, 2), "utf-8");
}

function updateJSONFile(filename, address, content) {
  try {
    let existingData = {};

    if (fs.existsSync(filename)) {
      const rawData = fs.readFileSync(filename, "utf-8");
      try {
        existingData = JSON.parse(rawData);
      } catch (e) {
        console.warn(
          `Existing data in ${filename} is not valid JSON. Initializing with an empty object.`
        );
      }
    }

    existingData[address] = content;

    fs.writeFileSync(filename, JSON.stringify(existingData, null, 2), "utf-8");
  } catch (error) {
    console.error(
      `Error updating file ${filename} for address ${address}:`,
      error
    );
  }
}

const check = async (startAddress = 0) => {
  const addressesFromFile = AD;
  const retryInterval = 60000; // 1 minute in milliseconds

  for (let i = startAddress; i < addressesFromFile.length; i++) {
    const address = addressesFromFile[i];

    try {
      const userData = await contract.methods
        .getUserAccountData(address)
        .call();

      const userEntry = {
        address: address,
        collateral:
          web3.utils.fromWei(userData.totalCollateralBase, "wei") / 10 ** 8,
        debt: web3.utils.fromWei(userData.totalDebtBase, "wei") / 10 ** 8,
        borrow:
          web3.utils.fromWei(userData.availableBorrowsBase, "wei") / 10 ** 8,
        threshold:
          web3.utils.fromWei(userData.currentLiquidationThreshold, "wei") /
          10 ** 2,
        ltv: web3.utils.fromWei(userData.ltv, "wei") / 10 ** 2,
        healthFactor: web3.utils.fromWei(userData.healthFactor, "ether"),
      };

      console.log(i, addressesFromFile.length);
      data.push(userEntry);
      updateJSONFile("./userData.json", address, userEntry);
    } catch (error) {
      console.error(`Error updating data for address ${address}:`, error);

      // Wait for 1 minute and retry the same address
      console.log(
        `Waiting for ${retryInterval / 1000} seconds before retrying...`
      );
      await new Promise((resolve) => setTimeout(resolve, retryInterval));
      i--; // Decrement index to retry the same address
    }

    // Optional: You can keep the existing delay here if needed
    // await new Promise((resolve) => setTimeout(resolve, 3000));
  }
};
const updateAllData = async () => {
  await check();
  await rewriteWatchlist();
  await updateUsefulData();
};

updateAllData();

setInterval(() => {
  updateAllData();
}, 24 * 60 * 60 * 1000); // 24 hours

setInterval(() => {
  check()
    .then(() => {
      return updateWatchlistData();
    })
    .then(() => {
      return updateUsefulData();
    });
}, 4 * 60 * 60 * 1000); // 4 hours

const usefulupdate = async () => {
  const usefulAddresses = UF;
  const addresses = Object.keys(usefulAddresses);
  console.log(addresses);

  for (const address of addresses) {
    try {
      const usefuldata = await contract.methods
        .getUserAccountData(address)
        .call();
      const useful = {
        address: address,
        collateral:
          web3.utils.fromWei(usefuldata.totalCollateralBase, "wei") / 10 ** 8,
        debt: web3.utils.fromWei(usefuldata.totalDebtBase, "wei") / 10 ** 8,
        borrow:
          web3.utils.fromWei(usefuldata.availableBorrowsBase, "wei") / 10 ** 8,
        threshold:
          web3.utils.fromWei(usefuldata.currentLiquidationThreshold, "wei") /
          10 ** 2,
        ltv: web3.utils.fromWei(usefuldata.ltv, "wei") / 10 ** 2,
        healthFactor: web3.utils.fromWei(usefuldata.healthFactor, "ether"),
      };
      console.log(useful);
      updateJSONFile("./useful.json", address, useful);
    } catch (error) {
      console.error(`Error fetching data for address ${address}:`, error);
    }
  }
};

const rewriteWatchlist = async () => {
  const userData = UD;
  let watchlist = {};
  for (const address in userData) {
    if (
      userData.hasOwnProperty(address) &&
      parseFloat(userData[address].healthFactor) < 2 &&
      parseFloat(userData[address].collateral) > 2000
    ) {
      watchlist[address] = userData[address];
    }
  }

  // Check if watchlist.json exists and delete it
  if (fs.existsSync("./watchlist.json")) {
    fs.unlinkSync("./watchlist.json");
  }

  // Write the new data to watchlist.json
  fs.writeFileSync(
    "./watchlist.json",
    JSON.stringify(watchlist, null, 2),
    "utf-8"
  );
  console.log("Watchlist updated successfully!");
};

const updateWatchlistData = async () => {
  // 1. Read the addresses from watchlist.json
  const watchlistData = WL;
  const retryInterval = 60000; // 1 minute in milliseconds

  // 2. Fetch user account data for each address using the contract method
  for (let i = 0; i < Object.keys(watchlistData).length; i++) {
    const address = Object.keys(watchlistData)[i];

    try {
      const userData = await contract.methods
        .getUserAccountData(address)
        .call();

      const updatedData = {
        address: address,
        collateral:
          web3.utils.fromWei(userData.totalCollateralBase, "wei") / 10 ** 8,
        debt: web3.utils.fromWei(userData.totalDebtBase, "wei") / 10 ** 8,
        borrow:
          web3.utils.fromWei(userData.availableBorrowsBase, "wei") / 10 ** 8,
        threshold:
          web3.utils.fromWei(userData.currentLiquidationThreshold, "wei") /
          10 ** 2,
        ltv: web3.utils.fromWei(userData.ltv, "wei") / 10 ** 2,
        healthFactor: web3.utils.fromWei(userData.healthFactor, "ether"),
      };

      console.log(updatedData);
      // Update watchlist data with new data
      updateJSONFile("./watchlist.json", address, updatedData);
    } catch (error) {
      console.error(`Error fetching data for address ${address}:`, error);

      // Wait for 1 minute and retry the same address
      console.log(
        `Waiting for ${retryInterval / 1000} seconds before retrying...`
      );
      await new Promise((resolve) => setTimeout(resolve, retryInterval));
      i--; // Decrement index to retry the same address
    }
  }
};

const updateUsefulData = async () => {
  // 1. Read the addresses and data from watchlist.json
  const watchlistData = WL;

  // 2. Filter addresses that have health factor < 1.1
  let usefulData = {};
  for (const address in watchlistData) {
    if (
      watchlistData.hasOwnProperty(address) &&
      parseFloat(watchlistData[address].healthFactor) < 1.1
    ) {
      usefulData[address] = watchlistData[address];
    }
  }

  // 3. Delete the existing useful.json (if it exists)
  if (fs.existsSync("./useful.json")) {
    fs.unlinkSync("./useful.json");
  }

  // 4. Write the new data to useful.json
  fs.writeFileSync(
    "./useful.json",
    JSON.stringify(usefulData, null, 2),
    "utf-8"
  );
  console.log("useful.json updated successfully!");
};

// Endpoint to trigger the update
app.get("/updateUsefulData", async (req, res) => {
  try {
    await updateUsefulData();
    res.status(200).send("useful.json updated successfully!");
  } catch (error) {
    console.error("Error updating useful.json:", error);
    res.status(500).send("Failed to update useful.json");
  }
});

// Add an endpoint to trigger this update

app.get("/", async (req, res) => {
  res.json({ addresses: addresses });
});
app.get("/rewatchlist", async (req, res) => {
  try {
    await updateAddressData();
    res.status(200).send("Watchlist updated successfully!");
  } catch (error) {
    console.error("Error updating watchlist:", error);
    res.status(500).send("Failed to update watchlist");
  }
});
app.get("/updateWatchlist", async (req, res) => {
  try {
    await updateWatchlistData();
    res.status(200).send("Watchlist data updated successfully!");
  } catch (error) {
    console.error("Error updating watchlist data:", error);
    res.status(500).send("Failed to update watchlist data");
  }
});

app.get("/check", async (req, res) => {
  check();
  res.send("Started");
});

app.get("/updateUseful", async (req, res) => {
  const fileContents = UF;
  res.send(fileContents);

  usefulupdate().catch((error) => {
    console.error("Error updating useful data:", error);
  });
});

app.get("/userSummary", async (req, res) => {
  if (!req.query.address) {
    return res.status(400).send("Address is required");
  }
  const data = await fetchContractData(req.query.address);
  res.json({ data });
});
app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});
