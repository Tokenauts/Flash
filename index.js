import { ethers } from 'ethers';
import {
  UiPoolDataProvider,
  UiIncentiveDataProvider,
  ChainId,
} from '@aave/contract-helpers';
import * as markets from '@bgd-labs/aave-address-book';
import Web3 from 'web3'
import abi from './abi/Pool.json' assert { type: "json" };
import { formatUserSummary, formatReserves } from '@aave/math-utils';
import dayjs from 'dayjs';
import express from 'express'

// 'reserves' and 'userReserves' inputs from Setup section



/*
- @param `currentTimestamp` Current UNIX timestamp in seconds, Math.floor(Date.now() / 1000)
- @param `marketReferencePriceInUsd` Input from [Fetching Protocol Data](#fetching-protocol-data), `reserves.baseCurrencyData.marketReferencePriceInUsd`
- @param `marketReferenceCurrencyDecimals` Input from [Fetching Protocol Data](#fetching-protocol-data), `reserves.baseCurrencyData.marketReferenceCurrencyDecimals`
- @param `userReserves` Input from [Fetching Protocol Data](#fetching-protocol-data), combination of `userReserves.userReserves` and `reserves.reservesArray`
- @param `userEmodeCategoryId` Input from [Fetching Protocol Data](#fetching-protocol-data), `userReserves.userEmodeCategoryId`
*/

const app = express()
const port = 3000


const provider = new ethers.providers.JsonRpcProvider(
  'https://eth-mainnet.public.blastapi.io',
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
  // Object containing array of pool reserves and market base currency data
  // { reservesArray, baseCurrencyData }
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
  marketReferencePriceInUsd: baseCurrencyData.marketReferenceCurrencyPriceInUsd,
});
const userSummary = formatUserSummary({
  currentTimestamp,
  marketReferencePriceInUsd: baseCurrencyData.marketReferenceCurrencyPriceInUsd,
  marketReferenceCurrencyDecimals:
    baseCurrencyData.marketReferenceCurrencyDecimals,
  userReserves: userReservesArray,
  formattedReserves: formattedPoolReserves,
  userEmodeCategoryId: userReserves.userEmodeCategoryId,
});
const imp = userSummary.userReservesData.filter(data=>data.stableBorrowsUSD+data.variableBorrowsUSD>0)
imp.forEach(im=>{
  delete im.reserve
})
console.log("Summary Is:",imp)
}


const addresses=[];
const data=[];
const useful=[];

const web3 = new Web3(
    "https://mainnet.infura.io/v3/b4d5f8243b484669b69913d1062982b9"
  );
const contractAddress = "0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2";

const contractABI = abi.abi
const contract = new web3.eth.Contract(contractABI, contractAddress);
   const check = async () =>
   { 
    const events = await contract.getPastEvents("Borrow", {
    fromBlock: 17555331,
    toBlock: "latest",
    });
    for(const event of events){
        addresses.push(event.returnValues.onBehalfOf)
        const userData = await contract.methods
          .getUserAccountData(event.returnValues.onBehalfOf)
          .call();
         
          data.push({
            collateral:web3.utils.fromWei(userData.totalCollateralBase, 'ether'),
            debt:web3.utils.fromWei(userData.totalDebtBase, 'ether'),
            borrow:web3.utils.fromWei(userData.availableBorrowsBase, 'ether'),
            threshold:web3.utils.fromWei(userData.currentLiquidationThreshold, 'ether'),
           ltv:web3.utils.fromWei(userData.ltv, 'ether'),
            healthFactor:web3.utils.fromWei(userData.healthFactor, 'ether')
          })
          if(web3.utils.fromWei(userData.healthFactor, 'ether')<1.1)
          useful.push({
            collateral:web3.utils.fromWei(userData.totalCollateralBase, 'ether'),
            debt:web3.utils.fromWei(userData.totalDebtBase, 'ether'),
            borrow:web3.utils.fromWei(userData.availableBorrowsBase, 'ether'),
            threshold:web3.utils.fromWei(userData.currentLiquidationThreshold, 'ether'),
           ltv:web3.utils.fromWei(userData.ltv, 'ether'),
            healthFactor:web3.utils.fromWei(userData.healthFactor, 'ether')
          })
          console.log(data)
          setTimeout(()=>{},3000)
    }
    /*
    totalDebtBase   uint256 :  843292887174896
  availableBorrowsBase   uint256 :  28524734707322
  currentLiquidationThreshold   uint256 :  7911
  ltv
     */
    console.log(addresses)
    console.log(data)
    return imp;
}

app.get('/', async (req, res) => {
  res.json({"addresses":addresses})
})

app.get('/check', async (req,res)=>{
  check();
  res.send("Started");
})
app.get('/data', (req,res)=>{
    res.json({data})
})

app.get('/useful',(req,res)=>{
    res.json({useful})
})
app.get('/userSummary',async (req,res)=>{
const data = await fetchContractData(req.body.address)
  res.json({data})
})
app.listen(port, () => {
  console.log(`Example app listening on port ${port}`)
})