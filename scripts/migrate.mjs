import fs, { access, readFile, writeFile } from 'fs/promises';
import { resolve } from 'path';

import JSON5 from 'json5';

run();

async function run() {
  const configFiles = await findConfigFiles();

  let exchangeRateHostWasEnabled = false;

  for (const configFilePath of configFiles) {
    const configWithComments = `${configFilePath}c`;

    if (await fileExists(configWithComments)) {
      console.warn(
        `Unable to transform ${configFilePath}, ${configWithComments} already exists.`,
      );
      continue;
    }

    const config = JSON5.parse(await readFile(configFilePath, 'utf-8'));

    const transformed = transformConfig(config);

    exchangeRateHostWasEnabled ||=
      transformed.exchange_rate_host.enabled !== false;

    await writeFile(configWithComments, JSON.stringify(transformed, null, 2));
  }

  if (exchangeRateHostWasEnabled) {
    console.warn(
      'Warning: ExchangeRateHost now requires an API key. Consider getting one at https://exchangerate.host/product',
    );
  }
}

/**
 * Migrate the config object from old version.
 */
function transformConfig(config) {
  const coinmarketcap = {
    enabled: wasEnabled(config, 'CoinMarketCap'),
    coins: config.crypto_cmc,
    ids: config.crypto_cmc_coinids,
    api_key: config.cmcApiKey,
  };

  const exchange_rate_host = {
    // Currencyinfo v1 doesn't support ExchangeRate API key
    enabled: wasEnabled(config, 'ExchangeRate'),
  };

  const cryptocompare = {
    enabled: wasEnabled(config, 'CryptoCompare'),
    api_key: config.ccApiKey,
    coins: config.crypto_cc,
  };

  const coingecko = {
    enabled: wasEnabled(config, 'CoinGecko'),
    coins: config.crypto_cg,
    ids: config.crypto_cg_coinids,
  };

  const moex = config.fiat;

  const notify = config.slack
    ? {
        slack: config.slack,
      }
    : undefined;

  return {
    decimals: config.decimals,
    rateDifferencePercentThreshold: config.rateDifferencePercentThreshold,
    refreshInterval: config.refreshInterval,
    minSources: 2,

    server: {
      port: config.port,
      mongodb: {
        port: 27017,
        host: '127.0.0.1',
      },
      redis: {
        port: 6379,
        host: 'localhost',
      },
    },

    notify,
    log_level: config.log_level,

    moex,
    base_coins: config.baseCoins,

    exchange_rate_host,
    coinmarketcap,
    cryptocompare,
    coingecko,
  };
}

/**
 * Returns whenever the given API was enabled in old config.
 */
function wasEnabled(config, apiName) {
  if (config.skipApi?.[apiName] === true) {
    return false;
  }
}

async function findConfigFiles() {
  const configPaths = process.argv.slice(2).map((path) => resolve(path));

  for (const path of configPaths) {
    if (!(await fileExists(path))) {
      console.error(`Configuration not found at: ${path}`);
      process.exit(-1);
    }
  }

  return configPaths;
}

async function fileExists(pathToFile) {
  try {
    await access(pathToFile, fs.constants.F_OK);
    return true;
  } catch (error) {
    return false;
  }
}
