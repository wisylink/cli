#!/usr/bin/env node
import { RunCli } from "../src/cli.js";

const exitCode = await RunCli(process.argv.slice(2));
process.exitCode = exitCode;
