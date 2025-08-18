// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.17;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ERC2771Context} from "@openzeppelin/contracts/metatx/ERC2771Context.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {Context} from "@openzeppelin/contracts/utils/Context.sol";
import {IFeeDistribution} from "./interfaces/IFeeDistribution.sol";
import {TransferHelper} from "@uniswap/lib/contracts/libraries/TransferHelper.sol";
/**
 * @title FeeDistribution
 * @notice Distributes fee tokens (ERC20 or native) to multiple recipients.
 */
contract FeeDistribution is AccessControl, ERC2771Context, IFeeDistribution {
    bytes32 public constant FEE_DISTRIBUTOR_ROLE =
        keccak256("FEE_DISTRIBUTOR_ROLE");

    /// @dev Sentinel address used to denote native token in place of an ERC20.
    address public constant NATIVE_TOKEN =
        0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE;

    constructor(
        address feeDistributor,
        address trustedForwarder
    ) ERC2771Context(trustedForwarder) {
        _setupRole(DEFAULT_ADMIN_ROLE, _msgSender());
        _setupRole(FEE_DISTRIBUTOR_ROLE, feeDistributor);
    }

    /**
     * @notice Distribute fees to multiple recipients across multiple fee tokens in a single call.
     * @param feeTokens Array of fee token addresses (or native token sentinel).
     * @param transactionHashes Array of arrays of transaction hashes (parallel to feeTokens).
     * @param amounts Array of arrays of amounts (parallel to feeTokens).
     * @param receivers Array of arrays of addresses to receive funds (parallel to feeTokens).
     */
    function distributeBatch(
        address[] calldata feeTokens,
        bytes[][] calldata transactionHashes,
        uint256[][] calldata amounts,
        address[][] calldata receivers
    ) external onlyRole(FEE_DISTRIBUTOR_ROLE) {
        uint256 len = feeTokens.length;

        require(
            len == transactionHashes.length &&
                len == amounts.length &&
                len == receivers.length,
            "FeeDistribution: Parameter length mismatch"
        );
        for (uint256 i; i < len; ) {
            _distribute(
                feeTokens[i],
                transactionHashes[i],
                amounts[i],
                receivers[i]
            );
            unchecked {
                ++i;
            }
        }
    }

    /**
     * @notice Distribute fees of a single token type to multiple recipients.
     * @param feeToken The address of the fee token (or native token sentinel).
     * @param transactionHashes An array of transaction hashes associated with each distribution.
     * @param amounts An array of amounts to distribute to each recipient.
     * @param receivers An array of addresses to receive the amounts.
     */
    function distribute(
        address feeToken,
        bytes[] calldata transactionHashes,
        uint256[] calldata amounts,
        address[] calldata receivers
    ) external onlyRole(FEE_DISTRIBUTOR_ROLE) {
        _distribute(feeToken, transactionHashes, amounts, receivers);
    }

    /**
     * @dev Internal function that actually performs the distribution.
     */
    function _distribute(
        address feeToken,
        bytes[] calldata transactionHashes,
        uint256[] calldata amounts,
        address[] calldata receivers
    ) internal {
        uint256 len = receivers.length;
        require(
            len == amounts.length,
            "FeeDistribution: Amounts and receivers length mismatch"
        );

        require(
            transactionHashes.length > 0,
            "FeeDistribution: Transaction hashes are required"
        );

        if (feeToken == NATIVE_TOKEN) {
            // Distribute native token
            for (uint256 i; i < len; ) {
                require(
                    amounts[i] > 0,
                    "FeeDistribution: Amount must be greater than 0"
                );
                require(
                    receivers[i] != address(0),
                    "FeeDistribution: Receiver address cannot be 0"
                );
                (bool success, ) = receivers[i].call{value: amounts[i]}("");
                require(success, "Native transfer failed");
                unchecked {
                    ++i;
                }
            }
        } else {
            // Distribute ERC20 token
            for (uint256 i; i < len; ) {
                require(
                    amounts[i] > 0,
                    "FeeDistribution: Amount must be greater than 0"
                );
                require(
                    receivers[i] != address(0),
                    "FeeDistribution: Receiver address cannot be 0"
                );
                TransferHelper.safeTransfer(feeToken, receivers[i], amounts[i]);
                unchecked {
                    ++i;
                }
            }
        }

        emit FeeDistributed(feeToken, transactionHashes, amounts, receivers);
    }

    /**
     * @dev Override for ERC2771 meta-transactions.
     */
    function _msgSender()
        internal
        view
        override(ERC2771Context, Context)
        returns (address sender)
    {
        return ERC2771Context._msgSender();
    }

    /**
     * @dev Override for ERC2771 meta-transactions.
     */
    function _msgData()
        internal
        view
        override(ERC2771Context, Context)
        returns (bytes calldata)
    {
        return ERC2771Context._msgData();
    }

    /**
     * @dev Override for ERC2771 meta-transactions.
     */
    function _contextSuffixLength()
        internal
        view
        virtual
        override(ERC2771Context, Context)
        returns (uint256)
    {
        return ERC2771Context._contextSuffixLength();
    }

    /**
     * @dev Fallback to receive native tokens directly.
     */
    receive() external payable {}
}
