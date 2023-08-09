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
import path from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";
import AD from "./addresses.json" assert { type: "json" };
import UF from "./useful.json" assert { type: "json" };
import UD from "./userData.json" assert { type: "json" };

const app = express();
const port = 3009;
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
  const imp = userSummary.userReservesData.filter(
    (data) => data.stableBorrowsUSD + data.variableBorrowsUSD > 0
  );
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
// Helper function to save data to a JSON file
function saveDataToFile(filename, content) {
  fs.writeFileSync(filename, JSON.stringify(content, null, 2), "utf-8");
}

// Helper function to append data to an existing JSON file
// Helper function to update the JSON file

function updateJSONFile(filename, address, content) {
  try {
    let existingData = {};

    // Check if the file exists and read its content
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

    // Update the content for the given address
    existingData[address] = content;

    // Write the updated data back to the file
    fs.writeFileSync(filename, JSON.stringify(existingData, null, 2), "utf-8");
  } catch (error) {
    console.error(
      `Error updating file ${filename} for address ${address}:`,
      error
    );
  }
}

const check = async () => {
  const addressesFromFile = AD;
  console.log("Loaded addresses from file:", addressesFromFile);

  for (const address of addressesFromFile) {
    const userData = await contract.methods.getUserAccountData(address).call();

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
    data.push(userEntry);
    updateJSONFile("./userData.json", address, userEntry);

    const collateralUSDValue =
      web3.utils.fromWei(userData.totalCollateralBase, "wei") / 10 ** 8;
    if (
      web3.utils.fromWei(userData.healthFactor, "ether") < 1.1 &&
      collateralUSDValue > 2000
    ) {
      const usefulEntry = {
        ...userEntry,
        collateral: collateralUSDValue,
      };

      useful.push(usefulEntry);

      // Update the useful data in the file
      updateJSONFile("./useful.json", address, usefulEntry);
    }

    // Update the user data in the file

    updateJSONFile("./userData.json", userEntry);

    console.log(userEntry);
    setTimeout(() => {}, 3000);
  }
};

const usefulupdate = async () => {
  const usefulAddresses = UF;
  const addresses = Object.keys(usefulAddresses); // Get all the addresses from the loaded dat
  console.log(addresses);

  for (const address of addresses) {
    try {
      const usefuldata = await contract.methods
        .getUserAccountData(address)
        .call();
      updateJSONFile("./userData.json", usefuldata);
    } catch (error) {
      console.error(`Error fetching data for address ${address}:`, error);
    }
  }
};

const updateAddressData = async () => {
  const userData = UD;
  let watchlist = {};
  for (const address in userData) {
    if (
      userData.hasOwnProperty(address) &&
      parseFloat(userData[address].healthFactor) < 2
    ) {
      watchlist[address] = userData[address];
    }
  }

  // 3. Write this filtered data to watchlist.json
  fs.writeFileSync(
    "./watchlist.json",
    JSON.stringify(watchlist, null, 2),
    "utf-8"
  );
  console.log("Watchlist updated successfully!");
};

// Later, when you want to update the watchlist

app.get("/", async (req, res) => {
  res.json({ addresses: addresses });
});
app.get("/updateWatchlist", async (req, res) => {
  try {
    await updateAddressData();
    res.status(200).send("Watchlist updated successfully!");
  } catch (error) {
    console.error("Error updating watchlist:", error);
    res.status(500).send("Failed to update watchlist");
  }
});

app.get("/check", async (req, res) => {
  check();
  res.send("Started");
});
app.get("/data", (req, res) => {
  res.status(200).json({ data: data });
});
app.get("/updateUseful", async (req, res) => {
  // Immediately read the contents of useful.json and send as a response
  const fileContents = UF;
  res.send(fileContents);

  // Run the update in the background without awaiting it
  usefulupdate().catch((error) => {
    console.error("Error updating useful data:", error);
  });
});

app.get("/useful", (req, res) => {
  res.status(200).json({ useful });
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
