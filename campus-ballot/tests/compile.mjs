import { readFileSync } from 'node:fs';
import solc from 'solc';

export function compile() {
  const input = {
    language: 'Solidity',
    sources: {'CampusBallot.sol': {content: readFileSync(new URL('../contracts/CampusBallot.sol', import.meta.url), 'utf8')}},
    settings: {optimizer: {enabled: false}, outputSelection: {'*': {'*': ['abi', 'evm.bytecode.object']}}},
  };
  const output = JSON.parse(solc.compile(JSON.stringify(input)));
  const errors = (output.errors || []).filter(error => error.severity === 'error');
  if (errors.length) throw new Error(errors.map(e => e.formattedMessage).join('\n'));
  return output.contracts['CampusBallot.sol'].CampusBallot;
}
