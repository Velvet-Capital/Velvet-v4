// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.17;

import {ErrorLibrary} from "../library/ErrorLibrary.sol";

import {IPortfolio} from "../core/interfaces/IPortfolio.sol";
import {IAccessController} from "../access/IAccessController.sol";
import {IProtocolConfig} from "../config/protocol/IProtocolConfig.sol";
import {IERC20Upgradeable} from "@openzeppelin/contracts-upgradeable-4.9.6/interfaces/IERC20Upgradeable.sol";
import {ITokenExclusionManager} from "../core/interfaces/ITokenExclusionManager.sol";

import {AccessRoles} from "../access/AccessRoles.sol";
import {Initializable} from "@openzeppelin/contracts-upgradeable-4.9.6/proxy/utils/Initializable.sol";

import {TokenBalanceLibrary} from "../core/calculations/TokenBalanceLibrary.sol";

/**
 * @title RebalancingConfig
 * @notice Provides auxiliary functions to support the RebalancingCore contract operations, including balance checks and validator checks.
 * @dev This contract includes helper functions for rebalancing operations such as validating handler, checking token balances, and initial setup.
 */

contract RebalancingConfig is AccessRoles, Initializable {
    IPortfolio public portfolio;
    IAccessController public accessController;
    IProtocolConfig public protocolConfig;
    ITokenExclusionManager internal tokenExclusionManager;

    mapping(address => bool) public tokensMapping;

    address internal _vault;

    /**
     * @notice Initializes the contract with portfolio, access controller, protocol and asset management configuration.
     * @param _portfolio Address of the Portfolio contract.
     * @param _accessController Address of the AccessController.
     */
    function __RebalancingHelper_init(
        address _portfolio,
        address _accessController
    ) internal onlyInitializing {
        if (_portfolio == address(0) || _accessController == address(0))
            revert ErrorLibrary.InvalidAddress();

        portfolio = IPortfolio(_portfolio);
        accessController = IAccessController(_accessController);
        protocolConfig = IProtocolConfig(portfolio.protocolConfig());
        tokenExclusionManager = ITokenExclusionManager(
            portfolio.tokenExclusionManager()
        );
        _vault = portfolio.vault();
    }

    /**
     * @dev Ensures that the function is only called by an asset manager.
     */
    modifier onlyAssetManager() {
        if (!accessController.hasRole(ASSET_MANAGER, msg.sender)) {
            revert ErrorLibrary.CallerNotAssetManager();
        }
        _;
    }

    /**
     * @notice Checks that each token bought by the Solver is in the portfolio list.
     * @param _ensoBuyTokens Array of token addresses bought by the Solver.
     * @param _newTokens Array of new portfolio tokens.
     */
    function _verifyNewTokenList(
        address[] memory _ensoBuyTokens,
        address[] memory _newTokens
    ) internal {
        uint256 tokenLength = _newTokens.length;
        for (uint256 i; i < tokenLength;) {
            address token = _newTokens[i];
            if (_getTokenBalanceOf(token, _vault) == 0)
                revert ErrorLibrary.BalanceOfVaultCannotNotBeZero(token);
            tokensMapping[token] = true;
            unchecked { ++i; }
        }

        uint256 ensoBuyTokensLength = _ensoBuyTokens.length;
        for (uint256 i; i < ensoBuyTokensLength;) {
            if (!tokensMapping[_ensoBuyTokens[i]]) {
                revert ErrorLibrary.InvalidBuyTokenList();
            }
            unchecked { ++i; }
        }

        for (uint256 i; i < tokenLength;) {
            delete tokensMapping[_newTokens[i]];
            unchecked { ++i; }
        }
    }

    /**
     * @notice The function is used to get tokens from portfolio
     * @return Array of token returned
     */
    function _getCurrentTokens() internal view returns (address[] memory) {
        return portfolio.getTokens();
    }

    /**
     * @notice Checks if a token is part of the current portfolio token list.
     * @param _token The address of the token to check.
     * @return bool Returns true if the token is part of the portfolio, false otherwise.
     */
    function _isPortfolioToken(
        address _token,
        address[] memory currentTokens
    ) internal pure returns (bool) {
        bool result;
        assembly {
            // Get the length of the currentTokens array
            let len := mload(currentTokens)

            // Get the pointer to the start of the array data
            let dataPtr := add(currentTokens, 0x20)

            // Loop through the array
            for {
                let i := 0
            } lt(i, len) {
                i := add(i, 1)
            } {
                // Check if the current token matches _token
                if eq(mload(add(dataPtr, mul(i, 0x20))), _token) {
                    // If found, set result to true
                    result := 1
                    // Break the loop
                    i := len
                }
            }
        }
        return result;
    }

    function getTokenBalancesOf(
        address[] memory _tokens,
        address _of
    ) internal view returns (uint256[] memory) {
        uint256 tokensLength = _tokens.length;
        uint256[] memory tokenBalances = new uint256[](tokensLength);
        for (uint256 i; i < tokensLength;) {
            tokenBalances[i] = _getTokenBalanceOf(_tokens[i], _of);
            unchecked { ++i; }
        }
        return tokenBalances;
    }

    function _getTokenBalanceOf(
        address _token,
        address _of
    ) internal view returns (uint256) {
        return IERC20Upgradeable(_token).balanceOf(_of);
    }
}
