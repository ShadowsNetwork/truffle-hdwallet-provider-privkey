const FiltersSubprovider = require('web3-provider-engine/subproviders/filters.js')
const HookedSubprovider = require('web3-provider-engine/subproviders/hooked-wallet.js')
const Transaction = require('ethereumjs-tx')
const ProviderEngine = require('web3-provider-engine')
const RpcSubprovider = require('web3-provider-engine/subproviders/rpc');
const EthereumjsWallet = require('ethereumjs-wallet')

function ChainIdSubProvider(chainId) {
    this.chainId = chainId;
 }
 
 ChainIdSubProvider.prototype.setEngine = function (engine) {
    const self = this;
    if (self.engine) return;
    self.engine = engine;
 };
 ChainIdSubProvider.prototype.handleRequest = function (payload, next, end) {
    if (
       payload.method == 'eth_sendTransaction' &&
       payload.params.length > 0 &&
       typeof payload.params[0].chainId == 'undefined'
    ) {
       payload.params[0].chainId = this.chainId;
    }
    next();
 };
 
 function NonceSubProvider() { }
 
 NonceSubProvider.prototype.setEngine = function (engine) {
    const self = this;
    if (self.engine) return;
    self.engine = engine;
 };
 NonceSubProvider.prototype.handleRequest = function (payload, next, end) {
    if (payload.method == 'eth_sendTransaction') {
       this.engine.sendAsync(
          {
             jsonrpc: '2.0',
             id: Math.ceil(Math.random() * 4415011859092441),
             method: 'eth_getTransactionCount',
             params: [payload.params[0].from, 'latest'],
          },
          (err, result) => {
             const nonce =
                typeof result.result == 'string'
                   ? result.result == '0x'
                      ? 0
                      : parseInt(result.result.substring(2), 16)
                   : 0;
             payload.params[0].nonce = nonce || 0;
             next();
          }
       );
    } else {
       next();
    }
 };

function HDWalletProvider (privateKeys, providerUrl, chainId) {

  this.wallets = {};
  this.addresses = [];
  
  // from https://github.com/trufflesuite/truffle-hdwallet-provider/pull/25/commits
  for (let key of privateKeys) {
    var wallet = EthereumjsWallet.default.fromPrivateKey(new Buffer(key, "hex"));
    var addr = '0x' + wallet.getAddress().toString('hex');
    this.addresses.push(addr);
    this.wallets[addr] = wallet;
  }
  
  const tmpAccounts = this.addresses;
  const tmpWallets = this.wallets;

  this.engine = new ProviderEngine()

  // from https://github.com/trufflesuite/truffle-hdwallet-provider/pull/66
  this.engine.addProvider(new ChainIdSubProvider(chainId));
  this.engine.addProvider(new NonceSubProvider())
  this.engine.addProvider(
    new HookedSubprovider({
      getAccounts: function (cb) {
        cb(null, tmpAccounts)
      },
      getPrivateKey: function (address, cb) {
        if (!tmpWallets[address]) {
          return cb('Account not found')
        } else {
          cb(null, tmpWallets[address].getPrivateKey().toString('hex'))
        }
      },
      signTransaction: function (txParams, cb) {
        let pkey
        if (tmpWallets[txParams.from]) {
          pkey = tmpWallets[txParams.from].getPrivateKey()
        } else {
          cb('Account not found')
        }
        var tx = new Transaction(txParams)
        tx.sign(pkey)
        var rawTx = '0x' + tx.serialize().toString('hex')
        cb(null, rawTx)
      }
    })
  )
  this.engine.addProvider(new FiltersSubprovider());
  this.engine.addProvider(new RpcSubprovider({ rpcUrl: providerUrl }));
  this.engine.start(); // Required by the provider engine.
}

HDWalletProvider.prototype.sendAsync = function () {
  this.engine.sendAsync.apply(this.engine, arguments)
}

HDWalletProvider.prototype.send = function () {
  return this.engine.send.apply(this.engine, arguments)
}

// returns the address of the given address_index, first checking the cache
HDWalletProvider.prototype.getAddress = function (idx) {
  console.log('getting addresses', this.addresses[0], idx)
  if (!idx) {
    return this.addresses[0]
  } else {
    return this.addresses[idx]
  }
}

// returns the addresses cache
HDWalletProvider.prototype.getAddresses = function () {
  return this.addresses
}

module.exports = HDWalletProvider