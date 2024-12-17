// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.17;

import {ReentrancyGuardUpgradeable} from "@openzeppelin/contracts-upgradeable-4.9.6/security/ReentrancyGuardUpgradeable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable-4.9.6/proxy/utils/UUPSUpgradeable.sol";
import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable-4.9.6/access/OwnableUpgradeable.sol";
import {IERC20Upgradeable} from "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import {ErrorLibrary} from "../library/ErrorLibrary.sol";
import {IIntentHandler} from "../handler/IIntentHandler.sol";
import {RebalancingConfig} from "./RebalancingConfig.sol";
import {IAssetHandler} from "../core/interfaces/IAssetHandler.sol";
import {IBorrowManager} from "../core/interfaces/IBorrowManager.sol";
import {IAssetManagementConfig} from "../config/assetManagement/IAssetManagementConfig.sol";
import {FunctionParameters} from "../FunctionParameters.sol";
import {IPositionManager} from "../wrappers/abstract/IPositionManager.sol";

/**
 * @title RebalancingCore
 * @dev Manages the rebalancing operations for Portfolio contracts, ensuring asset managers can update token weights and swap tokens as needed.
 * Inherits RebalancingConfig for auxiliary functions like checking token balances.
 */
contract Rebalancing is
  OwnableUpgradeable,
  ReentrancyGuardUpgradeable,
  UUPSUpgradeable,
  RebalancingConfig
{
  /// @notice Emitted when weights are successfully updated after a swap operation.
  event UpdatedWeights(address[] tokens, uint256[] amounts);
  event UpdatedTokens(address[] sellTokens, address[] newTokens);
  event PortfolioTokenRemoved(
    address indexed token,
    address indexed vault,
    uint256 indexed balance,
    uint256 atSnapshotId
  );
  event TokenRepayed(FunctionParameters.RepayParams);
  event DirectTokenRepayed(
    address indexed _debtToken,
    address indexed _protocolToken,
    uint256 indexed _repayAmount
  );
  event Borrowed(
    address indexed _tokenToBorrow,
    uint256 indexed _amountToBorrow
  );
  event CollateralTokensEnabled(address[] tokens, address controller);
  event CollateralTokensDisabled(address[] tokens, address controller);
  event ClaimedRewardTokens(address _token, address _target, uint256 _amount);

  uint256 public constant TOTAL_WEIGHT = 10_000; // Represents 100% in basis points.
  uint256 public tokensBorrowed;

  IBorrowManager internal borrowManager;

  /// @custom:oz-upgrades-unsafe-allow constructor
  constructor() {
    _disableInitializers();
  }

  /**
   * @notice Initializes the Rebalancing contract.
   * @param _portfolio Address of the Portfolio contract.
   * @param _accessController Address of the AccessController.
   */
  function init(
    address _portfolio,
    address _accessController,
    address _borrowManager
  ) external initializer {
    __Ownable_init();
    __ReentrancyGuard_init();
    __UUPSUpgradeable_init();
    __RebalancingHelper_init(_portfolio, _accessController);
    borrowManager = IBorrowManager(_borrowManager);
  }

  /**
   * @notice Allows an asset manager to propose new weights for tokens in the portfolio.
   * @param _sellTokens Array of tokens to sell.
   * @param _sellAmounts Corresponding amounts of each token to sell.
   * @param _handler Address of the swap handler.
   * @param _callData Encoded swap call data.
   */
  function updateWeights(
    address[] calldata _sellTokens,
    uint256[] calldata _sellAmounts,
    address _handler,
    bytes memory _callData
  ) external virtual nonReentrant onlyAssetManager {
    // Extra Parameter to define assetManager intent(which token to sell and which to buy) + Check for it
    //Check for not selling the whole amount

    _updateWeights(
      _sellTokens,
      _getCurrentTokens(),
      _sellAmounts,
      _handler,
      _callData
    );

    emit UpdatedWeights(_sellTokens, _sellAmounts);
  }

  /**
   * @dev Internal function to handle the logic of updating weights.
   * @param _sellTokens Tokens to be sold.
   * @param _newTokens New set of tokens after rebalancing.
   * @param _sellAmounts Amounts of each sell token.
   * @param _handler The handler to execute swaps.
   * @param _callData Swap details.
   */
  function _updateWeights(
    address[] calldata _sellTokens,
    address[] memory _newTokens,
    uint256[] calldata _sellAmounts,
    address _handler,
    bytes memory _callData
  ) private protocolNotPaused {
    if (!protocolConfig.isSolver(_handler)) revert ErrorLibrary.InvalidSolver();

    // Pull tokens to be completely removed from portfolio to handler for swapping.
    uint256 sellTokenLength = _sellTokens.length;
    uint256 sellAmountLength = _sellAmounts.length;

    if (sellAmountLength != sellTokenLength) {
      revert ErrorLibrary.InvalidLength();
    }

    for (uint256 i; i < sellTokenLength; i++) {
      address sellToken = _sellTokens[i];
      if (sellToken == address(0)) revert ErrorLibrary.InvalidAddress();
      portfolio.pullFromVault(sellToken, _sellAmounts[i], _handler);
    }

    // Execute the swap using the handler.
    address[] memory ensoBuyTokens = IIntentHandler(_handler)
      .multiTokenSwapAndTransferRebalance(
        FunctionParameters.EnsoRebalanceParams(
          IPositionManager(
            IAssetManagementConfig(portfolio.assetManagementConfig())
              .positionManager()
          ),
          _vault,
          _callData
        )
      );

    // Verify that all specified sell tokens have been completely sold by the handler.
    for (uint256 i; i < sellTokenLength; i++) {
      uint256 dustValue = (_sellAmounts[i] *
        protocolConfig.allowedDustTolerance()) / TOTAL_WEIGHT;
      if (_getTokenBalanceOf(_sellTokens[i], _handler) > dustValue)
        revert ErrorLibrary.BalanceOfHandlerShouldNotExceedDust();
    }

    // Ensure that each token bought by the solver is in the portfolio list.
    _verifyNewTokenList(ensoBuyTokens, _newTokens);
  }

  /**
   * @notice Updates the portfolio’s token list, adjusts weights, and verifies token balances.
   * @dev Uses a 256-slot bitmap to efficiently track up to 65,536 unique token addresses.
   *      Each token address is mapped to a unique bit position in the bitmap using keccak256 hashing.
   * @param rebalanceData Struct containing rebalance details including token lists and related data.
   */
  function updateTokens(
    FunctionParameters.RebalanceIntent calldata rebalanceData
  ) external virtual nonReentrant onlyAssetManager {
    address[] calldata _sellTokens = rebalanceData._sellTokens;
    address[] calldata _newTokens = rebalanceData._newTokens;
    address[] memory _tokens = _getCurrentTokens();

    // Update the portfolio's token list with new tokens
    portfolio.updateTokenList(_newTokens);

    // Perform token update and weights adjustment based on provided rebalance data
    _updateWeights(
      _sellTokens,
      _newTokens,
      rebalanceData._sellAmounts,
      rebalanceData._handler,
      rebalanceData._callData
    );

    // Initialize a bitmap with 256 slots to handle up to 65,536 unique bit positions
    uint256[256] memory tokenBitmap;
    uint256 tokenLength = _tokens.length;
    uint256[] memory initialBalances = new uint256[](tokenLength);

    unchecked {
      // Populate the bitmap with current tokens and store their initial balances
      for (uint256 i; i < tokenLength; i++) {
        address token = _tokens[i];

        // Store the current balance of the token for later verification
        initialBalances[i] = _getTokenBalanceOf(token, _vault);

        // Calculate a unique bit position for this token
        uint256 bitPos = uint256(keccak256(abi.encodePacked(token))) % 65536; // Hash to get a unique bit position in the range 0-65,535
        uint256 index = bitPos / 256; // Determine the specific uint256 slot in the array (0 to 255)
        uint256 offset = bitPos % 256; // Determine the bit position within that uint256 slot (0 to 255)

        // Set the bit for this token in the bitmap to mark it as present
        tokenBitmap[index] |= (1 << offset);
      }

      // Remove new tokens from the bitmap to avoid unnecessary balance checks
      for (uint256 i; i < _newTokens.length; i++) {
        uint256 bitPos = uint256(keccak256(abi.encodePacked(_newTokens[i]))) %
          65536;
        uint256 index = bitPos / 256;
        uint256 offset = bitPos % 256;

        // Clear the bit for each new token to mark it as excluded from checks
        tokenBitmap[index] &= ~(1 << offset);
      }

      // Verify balances for remaining tokens in the bitmap
      uint256 dustTolerance = protocolConfig.allowedDustTolerance();
      for (uint256 i; i < tokenLength; i++) {
        address token = _tokens[i];

        // Calculate the bit position for this token to verify its presence
        uint256 bitPos = uint256(keccak256(abi.encodePacked(token))) % 65536;
        uint256 index = bitPos / 256;
        uint256 offset = bitPos % 256;

        // Check if the bit for this token is still set in the bitmap
        if ((tokenBitmap[index] & (1 << offset)) != 0) {
          // Calculate the allowable "dust" amount based on the initial balance
          uint256 dustValue = (initialBalances[i] * dustTolerance) /
            TOTAL_WEIGHT;

          // Verify that the token's balance does not exceed the allowable dust tolerance
          if (_getTokenBalanceOf(token, _vault) > dustValue)
            revert ErrorLibrary.BalanceOfVaultShouldNotExceedDust();
        }
      }
    }

    // Emit an event to signal that tokens have been updated
    emit UpdatedTokens(_sellTokens, _newTokens);
  }

  /**
   * @notice Executes a flash loan to repay debt and rebalance the portfolio.
   * @param repayData Struct containing all necessary parameters for executing the flash loan and rebalancing.
   * @dev This function is called by the asset manager to manage debts and portfolio balance.
   * The flash loan is obtained from the specified pool, and the function handles token swaps and repayments.
   */
  function repay(
    address _controller,
    FunctionParameters.RepayParams calldata repayData
  ) external onlyAssetManager nonReentrant protocolNotPaused {
    // Attempt to repay the debt through the borrowManager
    // Returns true if the token's debt is fully repaid, false if partial repayment
    bool isTokenFullyRepaid = borrowManager.repayVault(_controller, repayData);

    // If the token's debt is fully repaid, decrement the count of borrowed token types
    // This helps maintain an accurate count for the MAX_BORROW_TOKEN_LIMIT check
    if (isTokenFullyRepaid) tokensBorrowed--;
    emit TokenRepayed(repayData);
  }

  /**
   * @notice Repays a debt directly by transferring the debt token and repaying the debt.
   * @param _debtToken The address of the debt token to be repaid.
   * @param _protocolToken The address of the protocol token used to repay the debt.
   * @param _repayAmount The amount of the debt token to be repaid.
   * @dev This function is used to repay a debt directly by transferring the debt token and repaying the debt.
   * It is called by the asset manager to repay a debt directly.
   */
  function directDebtRepayment(
    address _debtToken, // Address of the debt token
    address _protocolToken, // Address of the protocol token to which the debt token is to be transferred
    uint256 _repayAmount // Amount of debt token to be repaid and type(uint256).max for full repayment
  ) external onlyAssetManager nonReentrant protocolNotPaused {
    if (_debtToken == address(0) || _protocolToken == address(0))
      revert ErrorLibrary.InvalidAddress();
    if (_repayAmount == 0) revert ErrorLibrary.AmountCannotBeZero();

    IAssetHandler assetHandler = IAssetHandler(
      protocolConfig.assetHandlers(_protocolToken)
    );

    address controller = protocolConfig.marketControllers(_protocolToken); //This will be pool address

    // Approve the protocol token to spend the debt token
    portfolio.vaultInteraction(
      _debtToken,
      assetHandler.approve(controller, _repayAmount)
    );

    // Repay the debt
    portfolio.vaultInteraction(
      controller,
      assetHandler.repay(_debtToken, _vault, _repayAmount)
    );

    //Check balance not zero
    if (_getTokenBalanceOf(_debtToken, _vault) == 0)
      revert ErrorLibrary.BalanceOfVaultCannotNotBeZero(_debtToken);

    //Remove approval
    portfolio.vaultInteraction(
      _debtToken,
      assetHandler.approve(_protocolToken, 0)
    );

    //Events
    emit DirectTokenRepayed(_debtToken, _protocolToken, _repayAmount);
  }

  /**
   * @notice Removes an portfolio token from the portfolio. Can only be called by the asset manager.
   * @param _token The address of the token to be removed from the portfolio.
   */
  function removePortfolioToken(
    address _token
  ) external onlyAssetManager nonReentrant protocolNotPaused {
    address[] memory currentTokens = _getCurrentTokens();
    if (!_isPortfolioToken(_token, currentTokens))
      revert ErrorLibrary.NotPortfolioToken();

    uint256 tokensLength = currentTokens.length;
    address[] memory newTokens = new address[](tokensLength - 1);
    uint256 j = 0;
    for (uint256 i; i < tokensLength; i++) {
      address token = currentTokens[i];
      if (token != _token) {
        newTokens[j++] = token;
      }
    }

    portfolio.updateTokenList(newTokens);
    uint256 tokenBalance = _getTokenBalanceOf(_token, _vault);
    _tokenRemoval(_token, tokenBalance);
  }

  /**
   * @notice Removes a non-portfolio token from the portfolio. Can only be called by the asset manager.
   * @param _token The address of the token to be removed.
   */
  function removeNonPortfolioToken(
    address _token
  ) external onlyAssetManager protocolNotPaused nonReentrant {
    if (_isPortfolioToken(_token, _getCurrentTokens()))
      revert ErrorLibrary.IsPortfolioToken();

    uint256 tokenBalance = _getTokenBalanceOf(_token, _vault);
    _tokenRemoval(_token, tokenBalance);
  }

  /**
   * @notice Removes a portion of a portfolio token from the portfolio. Can only be called by the asset manager.
   * @param _token The address of the token to be partially removed from the portfolio.
   * @param _percentage The percentage of the token balance to be removed from the portfolio.
   * @dev This function allows the asset manager to remove a specified percentage of a token from the portfolio.
   * It reverts if the token is not part of the portfolio.
   */
  function removePortfolioTokenPartially(
    address _token,
    uint256 _percentage
  ) external onlyAssetManager protocolNotPaused nonReentrant {
    if (!_isPortfolioToken(_token, _getCurrentTokens()))
      revert ErrorLibrary.NotPortfolioToken();

    uint256 tokenBalanceToRemove = _getTokenBalanceForPartialRemoval(
      _token,
      _percentage
    );

    _tokenRemoval(_token, tokenBalanceToRemove);
  }

  /**
   * @notice Removes a non-portfolio token partially from the portfolio. Can only be called by the asset manager.
   * @param _token The address of the token to be removed.
   */
  function removeNonPortfolioTokenPartially(
    address _token,
    uint256 _percentage
  ) external onlyAssetManager protocolNotPaused nonReentrant {
    if (_isPortfolioToken(_token, _getCurrentTokens()))
      revert ErrorLibrary.IsPortfolioToken();

    uint256 tokenBalanceToRemove = _getTokenBalanceForPartialRemoval(
      _token,
      _percentage
    );

    _tokenRemoval(_token, tokenBalanceToRemove);
  }

  /**
   * @notice Enables specified tokens as collateral in the lending protocol.
   * @dev This function allows the asset manager to designate certain tokens as collateral,
   *      which can then be used to borrow other assets or increase borrowing capacity.
   *      It interacts with the lending protocol through the AssetHandler contract.
   * @param _tokens An array of token addresses to be enabled as collateral.
   * @param _controller The address of the lending protocol's controller contract.
   */
  function enableCollateralTokens(
    //Here need to add loop, because for aave it takes only one token at a time
    address[] memory _tokens,
    address _controller
  ) external onlyAssetManager {
    if (!protocolConfig.isSupportedControllers(_controller))
      revert ErrorLibrary.InvalidAddress();
    IAssetHandler assetHandler = IAssetHandler(
      protocolConfig.assetHandlers(_controller)
    );
    portfolio.vaultInteraction(_controller, assetHandler.enterMarket(_tokens));
    emit CollateralTokensEnabled(_tokens, _controller);
  }

  /**
   * @notice Disables specified tokens as collateral in the lending protocol.
   * @dev This function allows the asset manager to remove certain tokens from being used as collateral.
   *      It interacts with the lending protocol through the AssetHandler contract for each token.
   * @param _tokens An array of token addresses to be disabled as collateral.
   *@param _controller The address of the lending protocol's controller contract.
   */
  function disableCollateralTokens(
    address[] memory _tokens,
    address _controller
  ) external onlyAssetManager {
    uint256 tokensLength = _tokens.length;
    if (!protocolConfig.isSupportedControllers(_controller))
      revert ErrorLibrary.InvalidAddress();
    IAssetHandler assetHandler = IAssetHandler(
      protocolConfig.assetHandlers(_controller)
    );
    for (uint256 i; i < tokensLength; i++) {
      address token = _tokens[i];
      portfolio.vaultInteraction(_controller, assetHandler.exitMarket(token));
    }
    emit CollateralTokensDisabled(_tokens, _controller);
  }

  /**
   * @notice Executes a borrow operation using the specified pool and collateral.
   * @param _pool Address of the pool to borrow from.
   * @param _tokens Address of the token to set as collateral.
   * @param _tokenToBorrow Address of the token to borrow.
   * @param _amountToBorrow Amount of the token to borrow.
   * @dev Checks the pool address for validity and performs the borrow operation.
   * Updates the portfolio with the new token list after the borrow operation.
   */
  function borrow(
    address _pool, // pool address to borrow from
    address[] memory _tokens, // tokens to set collateral
    address _tokenToBorrow, // token to borrow
    address _controller, // controller address
    uint256 _amountToBorrow
  ) external onlyAssetManager protocolNotPaused {
    // Check for _pool address validity, prevent malicious address input
    if (
      _pool == address(0) ||
      _tokenToBorrow == address(0) ||
      !protocolConfig.isBorrowableToken(_pool) ||
      !protocolConfig.isSupportedControllers(_controller)
    ) revert ErrorLibrary.InvalidAddress();

    if (_amountToBorrow == 0) revert ErrorLibrary.AmountCannotBeZero();

    //Ensures the number of different borrowed token types doesn't exceed protocol limits
    if (tokensBorrowed > protocolConfig.MAX_BORROW_TOKEN_LIMIT()) {
      revert ErrorLibrary.BorrowTokenLimitExceeded();
    }

    IAssetHandler assetHandler = IAssetHandler(
      protocolConfig.assetHandlers(_controller)
    );

    uint256 balanceBefore = _getTokenBalanceOf(_tokenToBorrow, _vault);

    // Get the number of borrowed tokens before the new borrow operation
    // This will be used to determine if we're borrowing a new token type
    uint256 borrowedLengthBefore = (
      assetHandler.getBorrowedTokens(_vault, _controller)
    ).length;

    // Setting token as collateral
    portfolio.vaultInteraction(_controller, assetHandler.enterMarket(_tokens));
    // Borrow
    portfolio.vaultInteraction(
      _pool,
      assetHandler.borrow(_pool, _tokenToBorrow, _vault, _amountToBorrow)
    );

    // Get the number of borrowed tokens after the borrow operation
    // If this number is larger than before, it means we borrowed a new token type
    uint256 borrowedLengthAfter = (
      assetHandler.getBorrowedTokens(_vault, _controller)
    ).length;

    // Increment the total number of borrowed token types if we borrowed a new token type
    // We only increment if the length increased, meaning this is a new token type being borrowed
    if (borrowedLengthAfter > borrowedLengthBefore) {
      tokensBorrowed++;
    }

    // Get the current list of tokens in the portfolio
    address[] memory currentTokens = _getCurrentTokens();
    // Check if the borrowed token is not already in the portfolio
    if (!_isPortfolioToken(_tokenToBorrow, currentTokens)) {
      uint256 length = currentTokens.length;
      // Create a new array with space for one additional token
      address[] memory newTokens = new address[](length + 1);
      // Use unchecked block to save gas by skipping overflow/underflow checks
      // This is safe here because we're only incrementing by small amounts
      unchecked {
        assembly {
          // Set the length of newTokens to currentTokens.length + 1
          mstore(newTokens, add(mload(currentTokens), 1))

          // Set pointers to the start of the token data in both arrays
          let srcPtr := add(currentTokens, 0x20)
          let destPtr := add(newTokens, 0x20)

          // Calculate the size of data to copy (32 bytes per token)
          let size := mul(length, 0x20)

          // Copy all tokens from currentTokens to newTokens
          for {
            let i := 0
          } lt(i, size) {
            i := add(i, 0x20)
          } {
            mstore(add(destPtr, i), mload(add(srcPtr, i)))
          }

          // Add the new token at the end of newTokens
          mstore(add(destPtr, size), _tokenToBorrow)
        }
      }
      // Update the portfolio with the new token list
      portfolio.updateTokenList(newTokens);
    }

    if (_getTokenBalanceOf(_tokenToBorrow, _vault) <= balanceBefore)
      revert ErrorLibrary.BorrowFailed();

    emit Borrowed(_tokenToBorrow, _amountToBorrow);
  }

  function _getTokenBalanceForPartialRemoval(
    address _token,
    uint256 _percentage
  ) internal view returns (uint256 tokenBalanceToRemove) {
    if (_percentage >= TOTAL_WEIGHT)
      revert ErrorLibrary.InvalidTokenRemovalPercentage();

    uint256 tokenBalance = _getTokenBalanceOf(_token, _vault);
    tokenBalanceToRemove = (tokenBalance * _percentage) / TOTAL_WEIGHT;
  }

  /**
   * @dev Handles the removal of a token and transfers its balance out of the vault.
   * @param _token The address of the token to be removed.
   */
  function _tokenRemoval(address _token, uint256 _tokenBalance) internal {
    if (_tokenBalance == 0) revert ErrorLibrary.BalanceOfVaultIsZero();

    // Snapshot for record-keeping before removing the token
    uint256 currentId = tokenExclusionManager.snapshot();

    // Deploy a new token removal vault for the token to remove
    address tokenRemovalVault = tokenExclusionManager.deployTokenRemovalVault();

    // Transfer the token balance from the vault to the token exclusion manager
    portfolio.pullFromVault(_token, _tokenBalance, tokenRemovalVault);

    // Record the removal details in the token exclusion manager
    tokenExclusionManager.setTokenAndSupplyRecord(
      currentId - 1,
      _token,
      tokenRemovalVault,
      portfolio.totalSupply()
    );

    // Log the token removal event
    emit PortfolioTokenRemoved(
      _token,
      tokenRemovalVault,
      _tokenBalance,
      currentId - 1
    );
  }

  /**
   * @dev This function allows the asset manager to claim reward tokens, which might be accumulated
   * from various activities like staking, liquidity provision, or participation in DeFi protocols.
   * The function ensures the safety and correctness of the operation by verifying that the
   * reward token's balance in the vault increases as a result of the claim. It also checks
   * that no other token balances in the vault have been unexpectedly reduced, which could
   * indicate an issue such as a bug in the target contract or malicious interference.
   *
   * Before executing the claim, the function stores the current balances of all tokens in the vault.
   * After executing the claim via a call to an external contract, it checks the new balances.
   * If the reward token's balance does not increase or if any other token's balance decreases,
   * the transaction is reverted to prevent potential losses.
   *
   * @param _tokenToBeClaimed The address of the reward token that the asset manager aims to claim.
   * @param _target The contract address that will process the claim. This contract is expected to
   * hold the reward logic and tokens.
   * @param _claimCalldata The calldata necessary to execute the claim function on the target contract.
   * This includes the method signature and parameters for the claim operation.
   */

  function claimRewardTokens(
    address _tokenToBeClaimed,
    address _target,
    bytes memory _claimCalldata
  ) external onlyAssetManager protocolNotPaused nonReentrant {
    if (!protocolConfig.isRewardTargetEnabled(_target))
      revert ErrorLibrary.RewardTargetNotEnabled();

    // Retrieve the list of all tokens in the portfolio and their balances before the claim operation
    address[] memory tokens = portfolio.getTokens();
    uint256[] memory tokenBalancesInVaultBefore = getTokenBalancesOf(
      tokens,
      _vault
    );

    uint256 rewardTokenBalanceBefore = _getTokenBalanceOf(
      _tokenToBeClaimed,
      _vault
    );

    // Execute the claim operation using the provided calldata on the target contract
    portfolio.vaultInteraction(_target, _claimCalldata);

    uint256[] memory tokenBalancesInVaultAfter = getTokenBalancesOf(
      tokens,
      _vault
    );

    // Fetch the new balance of the reward token in the vault after the claim operation
    uint256 rewardTokenBalanceAfter = _getTokenBalanceOf(
      _tokenToBeClaimed,
      _vault
    );

    // Ensure the reward token balance has increased, otherwise revert the transaction
    if (rewardTokenBalanceAfter <= rewardTokenBalanceBefore)
      revert ErrorLibrary.ClaimFailed();

    // Check that no other token balances have decreased, ensuring the integrity of the vault's assets
    uint256 tokensLength = tokens.length;
    for (uint256 i; i < tokensLength; i++) {
      if (tokenBalancesInVaultAfter[i] < tokenBalancesInVaultBefore[i])
        revert ErrorLibrary.ClaimFailed();
    }
    emit ClaimedRewardTokens(
      _tokenToBeClaimed,
      _target,
      rewardTokenBalanceAfter
    );
  }

  /**
   * @notice Authorizes contract upgrade by the contract owner.
   * @param _newImplementation Address of the new contract implementation.
   */
  function _authorizeUpgrade(
    address _newImplementation
  ) internal override onlyOwner {
    // Intentionally left empty as required by an abstract contract
  }

  /**
   * @notice Modifier to restrict function if protocol is paused.
   * Uses the `isProtocolPaused` function to determine the protocol pause status.
   * @dev Reverts with a ProtocolIsPaused error if the protocol is paused.
   */
  modifier protocolNotPaused() {
    if (protocolConfig.isProtocolPaused())
      revert ErrorLibrary.ProtocolIsPaused();
    _; // Continues function execution if the protocol is not paused
  }
}