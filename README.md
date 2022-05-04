# Babylon Core-contracts

This repository provides all the interfaces and helper contracts needed to start building on top of [Babylon Finance](https://babylon.finance) Gardens.



## Building on Babylon

Babylon provides a new DeFi lego building block. Babylon Gardens are the first **DeFi Investment DAO primitive (ERC-20)**.

Gardens are tokenized investment clubs/DAOs where users can deposit digital assets and receive a tokenized share (ERC-20) representing their ownership.

Developers can build on top of Babylon Gardens and benefit from all the following built-in features.

## Built-in Features

- Garden ERC-20 tokens are **fully composable and transferrable**.
- Gardens are **non-custodial and trust minimized**. Only users have access to their funds. Capital can only be allocated to approved strategies.
- Gardens also provide an **NFT Membership token (ERC-721)**. Members of a garden can mint their NFT.
- **Built-in light governance system with signature based voting**. Gas-free.
- No-hassle and **No code UI** to create strategies and deploy capital to +15 DeFi protocols including Aave, Compound, Uniswap, Curve and Convex.
- DeFi execution costs are automatically shared between all members of a Garden, increasing the capital efficiency.
- Garden UI where users & managers can deposit/withdraw and monitor the performance of their investment club.

You can read more in our [managers page](https://www.babylon.finance/managers).

## Architecture

![image](https://user-images.githubusercontent.com/541599/166601087-734a1c13-f979-4ec3-be8c-d1346e475c14.png)

Babylon uses several layers of abstraction. Every investment club aka Garden is its own smart contract. Every DeFi strategy within a garden is its own smart contract as well.

These layers of abstraction provide a high-level of isolation and composability. This ensures that potential bugs or hacks get isolated to specific strategies and clubs.

You have all the information in our [Litepaper](https://docs.babylon.finance/litepaper).

## Deployed contracts

You can see all the deployed [open-sourced contracts here](https://docs.babylon.finance/deployments).

