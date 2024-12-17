// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.17;

import {FunctionParameters} from "../../FunctionParameters.sol";

interface IAssetHandler {
  struct MultiTransaction {
    address to;
    bytes txData;
  }

  function getBalance(
    address pool,
    address asset
  ) external view returns (uint256 balance);

  function getDecimals() external pure returns (uint256 decimals);

  function enterMarket(
    address[] memory assets
  ) external pure returns (bytes memory data);

  function exitMarket(address asset) external pure returns (bytes memory data);

  function borrow(
    address pool,
    address asset,
    address onBehalfOf,
    uint256 borrowAmount
  ) external view returns (bytes memory data);

  function repay(
    address asset,
    address onBehalfOf,
    uint256 borrowAmount
  ) external view returns (bytes memory data);

  function approve(
    address pool,
    uint256 borrowAmount
  ) external pure returns (bytes memory data);

  function getAllProtocolAssets(
    address account,
    address comptroller,
    address[] memory portfolioTokens
  )
    external
    view
    returns (address[] memory lendTokens, address[] memory borrowTokens);

  function getUserAccountData(
    address user,
    address comptoller,
    address[] memory portfolioTokens
  )
    external
    view
    returns (
      FunctionParameters.AccountData memory accountData,
      FunctionParameters.TokenAddresses memory tokenBalances
    );

  function getBorrowedTokens(
    address user,
    address comptroller
  ) external view returns (address[] memory borrowedTokens);

  function getInvestibleBalance(
    address _token,
    address _vault,
    address _controller,
    address[] memory _portfolioTokens
  ) external view returns (uint256);

  function loanProcessing(
    address vault,
    address executor,
    address controller,
    address receiver,
    address[] memory lendTokens,
    uint256 totalCollateral,
    uint fee,
    FunctionParameters.FlashLoanData memory flashData
  )
    external
    view
    returns (MultiTransaction[] memory transactions, uint256 totalFlashAmount);

  function executeUserFlashLoan(
    address _vault,
    address _receiver,
    uint256 _portfolioTokenAmount,
    uint256 _totalSupply,
    address[] memory borrowedTokens,
    FunctionParameters.withdrawRepayParams calldata repayData
  ) external;

  function executeVaultFlashLoan(
    address _receiver,
    FunctionParameters.RepayParams calldata repayData
  ) external;

  function getCollateralAmountToSell(
    address _user,
    address _controller,
    address _protocolToken,
    address[] memory lendTokens,
    uint256 _debtRepayAmount,
    uint256 feeUnit,
    uint256 totalCollateral,
    uint256 bufferUnit
  ) external view returns (uint256[] memory amounts);
}