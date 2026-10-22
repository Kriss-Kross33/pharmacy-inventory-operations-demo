#!/bin/bash
set -e
yarn install --frozen-lockfile
yarn workspace @workspace/db push
