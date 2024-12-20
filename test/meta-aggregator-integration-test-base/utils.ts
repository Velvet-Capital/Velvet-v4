import axios from "axios";


export async function createMetaAggregatorCalldata(
    handler: string,
    receiver: string,
    _tokenIn: any,
    _tokenOut: any,
    _amountIn: any
): Promise<any> {
    
    try {
        const priceParams = {
            slippage: 10,
            amount: _amountIn,
            tokenIn: _tokenIn,
            tokenOut: _tokenOut,
            sender: handler,
            receiver: receiver,
            chainId: 8453,
            skipSimulation: true,
        };

        console.log(priceParams)

        const postUrl = "http://arbitrumcentral.velvetdao.xyz:3000/best-quotes";

        const response = await axios.post(postUrl, priceParams);
        return response.data;
    } catch (error) {
        // Check if the error is an AxiosError
        if (axios.isAxiosError(error)) {
            console.error("Axios error occurred!");

            // Extract useful information
            if (error.response) {
                // Server responded with a status code outside the 2xx range
                console.error("Response Status:", error.response.status);
                console.error("Response Data:", error.response.data);
                console.error("Response Headers:", error.response.headers);
            } else if (error.request) {
                // Request was made but no response was received
                console.error("No response received:", error.request);
            } else {
                // Other errors, like setting up the request
                console.error("Error Message:", error.message);
            }
        } else {
            // Non-Axios error
            console.error("An unexpected error occurred:", error);
        }
    }
}

