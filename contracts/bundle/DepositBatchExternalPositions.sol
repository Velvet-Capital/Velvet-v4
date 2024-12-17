// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.17;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { TransferHelper } from "@uniswap/lib/contracts/libraries/TransferHelper.sol";
import { IAllowanceTransfer } from "../core/interfaces/IAllowanceTransfer.sol";
import { ErrorLibrary } from "../library/ErrorLibrary.sol";
import { IPortfolio } from "../core/interfaces/IPortfolio.sol";
import { FunctionParameters } from "../FunctionParameters.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import { IPositionManager } from "../wrappers/abstract/IPositionManager.sol";
import { IPositionWrapper } from "../wrappers/abstract/IPositionWrapper.sol";
import { WrapperFunctionParameters } from "../wrappers/WrapperFunctionParameters.sol";
import { IAssetManagementConfig } from "../config/assetManagement/IAssetManagementConfig.sol";

/**
 * @title DepositBatchExternalPositions
 * @notice A contract for performing multi-token swap and deposit operations.
 * @dev This contract uses Enso's swap execution logic for delegating swaps.
 */
contract DepositBatchExternalPositions is ReentrancyGuard {
  // The address of Enso's swap execution logic; swaps are delegated to this target.
  address constant SWAP_TARGET = 0x38147794FF247e5Fc179eDbAE6C37fff88f68C52;

  /**
   * @notice Performs a multi-token swap and deposit operation for the user.
   * @param data Struct containing parameters for the batch handler.
   */
  function multiTokenSwapETHAndTransfer(
    FunctionParameters.BatchHandler memory data,
    FunctionParameters.ExternalPositionDepositParams memory _params
  ) external payable nonReentrant {
    if (msg.value == 0) {
      revert ErrorLibrary.InvalidBalance();
    }

    address user = msg.sender;

    _multiTokenSwapAndDeposit(data, _params, user);

    (bool sent, ) = user.call{ value: address(this).balance }("");
    if (!sent) revert ErrorLibrary.TransferFailed();
  }

  /**
   * @notice Handles the entire process of swapping multiple tokens and depositing them into an external position.
   * @param data Struct containing parameters for batch processing including token details and swap instructions.
   * @param _params Additional parameters specifically for managing deposits into external positions.
   * @param _user Address of the user initiating the deposit.
   */
  function multiTokenSwapAndDeposit(
    FunctionParameters.BatchHandler memory data,
    FunctionParameters.ExternalPositionDepositParams memory _params,
    address _user
  ) external payable nonReentrant {
    address _depositToken = data._depositToken;

    _multiTokenSwapAndDeposit(data, _params, _user);

    // Return any leftover invested token dust to the user
    uint256 depositTokenBalance = _getTokenBalance(
      _depositToken,
      address(this)
    );
    if (depositTokenBalance > 0) {
      TransferHelper.safeTransfer(_depositToken, _user, depositTokenBalance);
    }
  }

  /**
   * @dev Internal function to handle the logic for multi-token swaps and deposits. It orchestrates token swaps,
   * liquidity adjustments, and deposits into both internal and external positions as defined in the params.
   * @param data Batch handler parameters defining the swap and deposit operations.
   * @param _params Parameters defining how external positions should be handled, including liquidity adjustments.
   * @param _user The user on whose behalf the operations are being conducted.
   */
  function _multiTokenSwapAndDeposit(
    FunctionParameters.BatchHandler memory data,
    FunctionParameters.ExternalPositionDepositParams memory _params,
    address _user
  ) internal {
    // Validations to ensure the correct array lengths for operations involving external positions.
    if (
      _params._swapTokens.length != _params._portfolioTokenIndex.length ||
      _params._portfolioTokenIndex.length != _params._isExternalPosition.length
    ) revert ErrorLibrary.InvalidLength();

    uint256 positionWrapperLength = _params._positionWrappers.length;

    if (
      positionWrapperLength != _params._positionWrapperIndex.length ||
      _params._positionWrapperIndex.length != _params._index0.length ||
      _params._index0.length != _params._index1.length ||
      positionWrapperLength != _params._tokenIn.length ||
      positionWrapperLength != _params._tokenOut.length ||
      positionWrapperLength != _params._amountIn.length ||
      positionWrapperLength != _params._amount0Min.length ||
      positionWrapperLength != _params._amount1Min.length
    ) revert ErrorLibrary.InvalidLength();

    address[] memory tokens = IPortfolio(data._target).getTokens();
    address target = data._target;
    uint256 tokenLength = tokens.length;

    // Swap tokens (calldata) and calculate deposit amounts for tokens not being deposited into external positions
    (
      uint256[] memory swapResults,
      uint256[] memory depositAmounts
    ) = _swapTokenToTokens(data, _params, tokenLength);

    // Increase liquidity for external positions and calculate deposit amounts for wrapped positions
    depositAmounts = _increaseLiquidityAndSetDepositAmounts(
      _params,
      swapResults,
      depositAmounts,
      _user,
      IPortfolio(target).assetManagementConfig()
    );

    // Approve target to deposit tokens into Velvet Core
    for (uint256 i; i < tokenLength; i++) {
      address _token = tokens[i];

      TransferHelper.safeApprove(_token, target, 0);
      TransferHelper.safeApprove(_token, target, depositAmounts[i]);
    }

    // Deposit tokens into Velvet Core
    IPortfolio(target).multiTokenDepositFor(
      _user,
      depositAmounts,
      data._minMintAmount
    );

    // Return any leftover vault token dust to the user
    for (uint256 i; i < tokenLength; i++) {
      address _token = tokens[i];
      uint256 portfoliodustReturn = _getTokenBalance(_token, address(this));
      if (portfoliodustReturn > 0) {
        TransferHelper.safeTransfer(_token, _user, portfoliodustReturn);
      }
    }
  }

  /**
   * @dev Function to manage swaps and deposit calculations for each token involved in the batch process.
   * @param data Parameters for executing swaps via a delegated call to a swap target.
   * @param _params Parameters detailing the external positions and their specific configurations.
   * @param _tokenLength The number of tokens involved in the portfolio.
   * @return Returns arrays of results from token swaps and calculated deposit amounts.
   */
  function _swapTokenToTokens(
    FunctionParameters.BatchHandler memory data,
    FunctionParameters.ExternalPositionDepositParams memory _params,
    uint256 _tokenLength
  ) internal returns (uint256[] memory, uint256[] memory) {
    address _depositToken = data._depositToken;
    uint256[] memory depositAmounts = new uint256[](_tokenLength);

    // Perform swaps and calculate deposit amounts for each token
    uint256 swapTokenLength = _params._swapTokens.length;
    uint256[] memory swapResults = new uint256[](swapTokenLength);
    for (uint256 i; i < swapTokenLength; i++) {
      address _token = _params._swapTokens[i];
      uint256 balance;
      if (_token == _depositToken) {
        //Sending encoded balance instead of swap calldata
        balance = abi.decode(data._callData[i], (uint256));
      } else {
        uint256 balanceBefore = _getTokenBalance(_token, address(this));
        (bool success, ) = SWAP_TARGET.delegatecall(data._callData[i]);
        if (!success) revert ErrorLibrary.CallFailed();
        uint256 balanceAfter = _getTokenBalance(_token, address(this));
        balance = balanceAfter - balanceBefore;
      }
      if (balance == 0) revert ErrorLibrary.InvalidBalanceDiff();

      swapResults[i] = balance;
      if (!_params._isExternalPosition[i])
        depositAmounts[_params._portfolioTokenIndex[i]] = balance;
    }

    return (swapResults, depositAmounts);
  }

  /**
   * @dev Adjusts liquidity for external positions and calculates the deposit amounts to be passed to the portfolio for final processing.
   * @param _params Parameters defining the external positions and the configurations for liquidity management.
   * @param _swapResults Results from the initial token swaps.
   * @param _depositAmounts Initial calculations of deposit amounts based on swaps.
   * @param _user User for whom the operations are being conducted.
   * @param _assetManagementConfig Configuration address used to manage asset settings within the portfolio.
   * @return Adjusted deposit amounts after accounting for liquidity added to external positions.
   */
  function _increaseLiquidityAndSetDepositAmounts(
    FunctionParameters.ExternalPositionDepositParams memory _params,
    uint256[] memory _swapResults,
    uint256[] memory _depositAmounts,
    address _user,
    address _assetManagementConfig
  ) internal returns (uint256[] memory) {
    // Increase Liquidity UniswapV3
    IPositionManager positionManager = IPositionManager(
      IAssetManagementConfig(_assetManagementConfig).positionManager()
    );

    // Increase liquidity for external positions
    uint256 _positionWrappersLength = _params._positionWrappers.length;
    for (uint256 i; i < _positionWrappersLength; i++) {
      address positionWrapperAddress = _params._positionWrappers[i];
      IPositionWrapper positionWrapper = IPositionWrapper(
        positionWrapperAddress
      );

      uint256 balanceBefore = _getTokenBalance(
        positionWrapperAddress,
        address(this)
      );

      _increaseLiquidity(
        _user,
        _params,
        _swapResults,
        i,
        positionManager,
        positionWrapper
      );

      uint256 balanceAfter = _getTokenBalance(
        positionWrapperAddress,
        address(this)
      );

      // Set deposit amounts for swapped external position
      _depositAmounts[_params._positionWrapperIndex[i]] =
        balanceAfter -
        balanceBefore;
    }
    return _depositAmounts;
  }

  /**
   * @dev Manages the liquidity increase for specific external positions, handling token approvals and interactions with the position manager.
   * @param _user The user performing the deposit.
   * @param _params External position parameters.
   * @param _swapResults Results of token swaps used for increasing liquidity.
   * @param i Index of the current external position being processed.
   * @param positionManager The position manager contract handling the Uniswap positions.
   * @param positionWrapper The position wrapper corresponding to the current position.
   */
  function _increaseLiquidity(
    address _user,
    FunctionParameters.ExternalPositionDepositParams memory _params,
    uint256[] memory _swapResults,
    uint256 i,
    IPositionManager positionManager,
    IPositionWrapper positionWrapper
  ) internal {
    // Approve position manager to increase liqudity
    TransferHelper.safeApprove(
      _params._swapTokens[_params._index0[i]],
      address(positionManager),
      0
    );
    TransferHelper.safeApprove(
      _params._swapTokens[_params._index0[i]],
      address(positionManager),
      _swapResults[_params._index0[i]]
    );
    TransferHelper.safeApprove(
      _params._swapTokens[_params._index1[i]],
      address(positionManager),
      0
    );
    TransferHelper.safeApprove(
      _params._swapTokens[_params._index1[i]],
      address(positionManager),
      _swapResults[_params._index1[i]]
    );

    if (positionWrapper.totalSupply() == 0) {
      // Initial mint to external position
      positionManager.initializePositionAndDeposit(
        _user,
        positionWrapper,
        WrapperFunctionParameters.InitialMintParams({
          _amount0Desired: _swapResults[_params._index0[i]],
          _amount1Desired: _swapResults[_params._index1[i]],
          _amount0Min: _params._amount0Min[i],
          _amount1Min: _params._amount1Min[i],
          _deployer: _params._deployer
        })
      );
    } else {
      // Increase liquidity in external position
      positionManager.increaseLiquidity(
        WrapperFunctionParameters.WrapperDepositParams({
          _dustReceiver: _user,
          _positionWrapper: positionWrapper,
          _amount0Desired: _swapResults[_params._index0[i]],
          _amount1Desired: _swapResults[_params._index1[i]],
          _amount0Min: _params._amount0Min[i],
          _amount1Min: _params._amount1Min[i],
          _tokenIn: _params._tokenIn[i],
          _tokenOut: _params._tokenOut[i],
          _amountIn: _params._amountIn[i]
        })
      );
    }
  }

  /**
   * @notice Helper function to get balance of any token for any user.
   * @param _token Address of token to get balance.
   * @param _of Address of user to get balance of.
   * @return uint256 Balance of the specified token for the user.
   */
  function _getTokenBalance(
    address _token,
    address _of
  ) internal view returns (uint256) {
    return IERC20(_token).balanceOf(_of);
  }

  // Function to receive Ether when msg.data is empty
  receive() external payable {}
}
