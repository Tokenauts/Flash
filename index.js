import { formatUserSummary } from '@aave/math-utils';
import {
    UiPoolDataProvider,
    UiIncentiveDataProvider,
    ChainId,
  } from '@aave/contract-helpers';
import express from 'express'
import Web3 from 'web3'
import abi from './abi/Pool.json' assert { type: "json" };
const app = express()
const port = 3000


const addresses=[];
const data=[];

const web3 = new Web3(
    "https://mainnet.infura.io/v3/b4d5f8243b484669b69913d1062982b9"
  );
const contractAddress = "0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2";

const contractABI = abi.abi
const contract = new web3.eth.Contract(contractABI, contractAddress);
contract.methods
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
    set
    
}

app.get('/', async (req, res) => {
    await check()
  res.json({"addresses":addresses})
})
app.get('/data', (req,res)=>{
    res.json({data})
})
app.listen(port, () => {
  console.log(`Example app listening on port ${port}`)
})