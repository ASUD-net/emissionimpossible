[![Version](https://img.shields.io/npm/v/@website-scraper/puppeteer-version-wrapper.svg?style=flat)](https://www.npmjs.com/package/@website-scraper/puppeteer-version-wrapper)
[![Downloads](https://img.shields.io/npm/dm/@website-scraper/puppeteer-version-wrapper.svg?style=flat)](https://www.npmjs.com/package/@website-scraper/puppeteer-version-wrapper)
[![Test compatibility with puppeteer](https://github.com/website-scraper/puppeteer-version-wrapper/actions/workflows/test-compatibility.yaml/badge.svg?branch=main)](https://github.com/website-scraper/puppeteer-version-wrapper/actions/workflows/test-compatibility.yaml)

# @website-scraper/puppeteer-version-wrapper

A wrapper module around `puppeteer` package that ensures [website-scraper-puppeteer](https://www.npmjs.com/package/website-scraper-puppeteer) always work with the latest supported version of Puppeteer.

`website-scraper-puppeteer` is tightly coupled to a specific Puppeteer major version, which quickly becomes outdated and unsupported.

To solve this issue, `website-scraper-puppeteer` is now depends on `@website-scraper/puppeteer-version-wrapper`, which automatically manages Puppeteer updates.

This module automatically updates its Puppeteer dependency using Dependabot and continuous integration. When tests pass, a new minor version is published to NPM, keeping compatibility up-to-date without manual intervention.

## How It Works

- Monitors Puppeteer releases via Dependabot
- Automatically merges updates after successful tests
- Publishes new minor versions to NPM
- Ensures `website-scraper-puppeteer` always uses a compatible Puppeteer version
