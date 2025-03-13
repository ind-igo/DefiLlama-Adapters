// TODO
// - wait for SBR
// - split functions into blast and base
// - do not double count collateral/debt, utilize timestamp to determine if collateral/debt is from blast or base

const BASELINE_CONTRACT = "0x14eB8d9b6e19842B5930030B18c50B0391561f27";
const BASELINE_CONTRACT_V2 = "0x1a49351bdB4BE48C0009b661765D01ed58E8C2d8";
const CREDT_CONTRACT = "0x158d9270F7931d0eB48Efd72E62c0E9fFfE0E67b";

const blastV2Contracts = {
  yesV2: {
    BPOOL: "0x1a49351bdB4BE48C0009b661765D01ed58E8C2d8",
    CREDT: "0x158d9270F7931d0eB48Efd72E62c0E9fFfE0E67b",
    LOOPS: "0xf9D9A93e4ae01904A612EcC1F5740EE101AC3e52"
  },
  machi: {
    BPOOL: "0x010392305558d58e1Cb0Eec5529a65bf3545f82e",
    CREDT: "0x2C156D62CCb49dE2F9Ff98f5816F9cC496bCf0e9",
    LOOPS: "0xaD9F1C515BEf9C5b6c4bDbd5F7af518471FE811E",
  },
  ai: {
    BPOOL: "0x389af3283496D3736d7E436CC1C17B7903ad5E0B",
    CREDT: "0xEa33B291CEAfF0FBF876912FB9bD642E2662555D",
    LOOPS: "0xeE0B0A5CA8F03B2Eb82C96bf0edA046556340bE1",
  },
  flappy: {
    BPOOL: "0x8C0579713c94157dB4043dd6806FbDdc138A863A",
    CREDT: "0x094C22B17CE0497670704d81821a748bDC705C04",
    LOOPS: "0x321d2F401BBCe03532B2FBbA1445a33A4584F7b7",
  }
}

const baseV3Contracts = {
  yes: {
    BPOOL: "0x143EbA17f64C773F542e7Bf126c9254c5160208E",
    CREDT: "0xa35E4Ac9565Fb006812755C30c369314be3511D9",
    LOOPS: "0x6B129C94eE04Ff4d989B0a0B2784Fc8bcFe777eF"
  },
  // sbr 
  ai: {
    BPOOL: "0x08975ea9C8560F9c2e77d36817b865899a435726",
    CREDT: "0x8a3b6a73856eb6A348CeD9F1E665270c7b638e40",
    LOOPS: "0xFA7b7C03330ADB91Fac75d72282F31A4ec82301b"
  },
  flappy: {
    BPOOL: "0xaF2AAA99b920CaBF3CcDc757EBACeb61d22Bf1c3",
    CREDT: "0x051bB87c013B12e58Dcbc421c7517DFAC4ae2dF2",
    LOOPS: "0x9c0A7c184390BdFcc1257F9F496f49221B01fcbD"
  }
}

async function tvl(api) {
  //floor, anchor, discovery
  const positions = [0, 1, 2];

  //return position info from baseline contract
  const position = await api.multiCall({ target: BASELINE_CONTRACT, calls: positions, abi: abi.getPosition, });
  //return managed positions from baseline contract
  const baselinePositionBalances = await api.multiCall({ target: BASELINE_CONTRACT, calls: position.map(i => ({ params: [i], })), abi: abi.getBalancesForPosition, });
  //sum the reserve balances
  api.addGasToken(baselinePositionBalances.map(i => i.reserves));

  // V2
  // baseline V2 Positions
  // Loop through blastV2Contracts and call getPosition on each BPOOL contract
  const v2PositionCalls = [];
  for (const [_, contracts] of Object.entries(blastV2Contracts)) {
    for (const position of positions) {
      v2PositionCalls.push({
        target: contracts.BPOOL,
        params: [position]
      });
    }
  }
  const v2PositionsBlast = await api.multiCall({ calls: v2PositionCalls, abi: v2Abi.getPosition });
  
  // Base V3 Positions
  const baseV3PositionCalls = [];
  for (const [_, contracts] of Object.entries(baseV3Contracts)) {
    for (const position of positions) {
      baseV3PositionCalls.push({
        target: contracts.BPOOL,
        params: [position]
      });
    }
  }
  const v3PositionsBase = await api.multiCall({ calls: baseV3PositionCalls, abi: v2Abi.getPosition });
  //account for collateral now locked in protocol from borrowing activity

  api.addGasToken(v2PositionsBlast.map(i => i.reserves));
  api.addGasToken(v3PositionsBase.map(i => i.reserves));
}

async function borrowed(api) {
  const lentReserves = await api.call({ abi: abi.totalLentReserves, target: BASELINE_CONTRACT, });
  api.addGasToken(lentReserves)

  // Blast V2
  
  // Prepare multicall arrays for V2 contracts
  const lentReservesV2Calls = [];
  const loopDebtV2Calls = [];
  
  for (const [_, contracts] of Object.entries(blastV2Contracts)) {
    lentReservesV2Calls.push({
      target: contracts.CREDT,
      abi: credtAbi.totalCreditIssued
    });
    
    loopDebtV2Calls.push({
      target: contracts.LOOPS,
      abi: loopsAbi.totalDebt
    });
  }
  
  // Execute multicalls
  const lentReservesV2Results = await api.multiCall({ calls: lentReservesV2Calls, abi: credtAbi.totalCreditIssued });
  const loopDebtV2Results = await api.multiCall({ calls: loopDebtV2Calls, abi: loopsAbi.totalDebt });
  
  // Sum up the results
  const totalLentReservesV2 = lentReservesV2Results.reduce((acc, val) => acc + BigInt(val), 0n);
  const totalLoopDebtV2 = loopDebtV2Results.reduce((acc, val) => acc + BigInt(val), 0n);
  
  api.addGasToken(totalLentReservesV2);
  api.addGasToken(totalLoopDebtV2);


  // Base V3
  const lentReservesV3Calls = [];
  const loopDebtV3Calls = [];
  
  for (const [_, contracts] of Object.entries(baseV3Contracts)) {
    lentReservesV3Calls.push({
      target: contracts.CREDT,
      abi: credtAbi.totalCreditIssued
    });
    
    loopDebtV3Calls.push({
      target: contracts.LOOPS,
      abi: loopsAbi.totalDebt
    });
  }
  
  // Execute multicalls
  const lentReservesV3Results = await api.multiCall({ calls: lentReservesV3Calls, abi: credtAbi.totalCreditIssued });
  const loopDebtV3Results = await api.multiCall({ calls: loopDebtV3Calls, abi: loopsAbi.totalDebt });
  
  const totalLentReservesV3 = lentReservesV3Results.reduce((acc, val) => acc + BigInt(val), 0n);
  const totalLoopDebtV3 = loopDebtV3Results.reduce((acc, val) => acc + BigInt(val), 0n);
  
  api.addGasToken(totalLentReservesV3);
  api.addGasToken(totalLoopDebtV3);
}

async function staking(api) {
  const v2CollateralLocked = await api.call({ target: CREDT_CONTRACT, abi: credtAbi.totalCollateralized });
  api.add(BASELINE_CONTRACT_V2, v2CollateralLocked);  // collateral deposited into protocol by EOA in exchange for a loan
}

module.exports = {
  hallmarks: [
    [1714251306, "Self-whitehat"]
    [1719899544, "Restore liquidity"]
    [1740759129, "Migration from Blast to Base"]
  ],
  doublecounted: true,
  blast: {
    tvl,
    borrowed,
    staking,
  },
};

const abi = {
  totalLentReserves: "function totalLentReserves() view returns (uint256)",
  getPosition:
    "function getPosition(uint8) view returns (tuple(uint8, int24, int24))",
  getBalancesForPosition:
    "function getBalancesForPosition(tuple(uint8,int24,int24)) view returns (uint256 reserves, uint256 bAsset)",
};

const v2Abi = {
  getPosition: "function getPosition(uint8) view returns (tuple(uint128 liquidity, uint160 sqrtPriceL, uint160 sqrtPriceU, uint256 bAssets, uint256 reserves, uint256 capacity))",
}

const credtAbi = {
  totalCreditIssued: "function totalCreditIssued() view returns (uint256)",
  totalCollateralized: "function totalCollateralized() view returns (uint256)",
}

const loopsAbi = {
  totalDebt: "function totalDebt() view returns (uint256)"
}
