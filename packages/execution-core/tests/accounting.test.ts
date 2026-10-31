import {describe,it,expect} from 'vitest';
import {createInvocationAccount,inInvocationAccount,recordInvocationCost,recordInvocationAsset} from '../src/invocation-account.js';
import {Graph} from '../src/index.js';
describe('extracted execution kernel',()=>{
  it('keeps concurrent invocation charges and writes isolated',async()=>{
    const first=createInvocationAccount();const second=createInvocationAccount();
    await Promise.all([
      inInvocationAccount(first,async()=>{await Promise.resolve();recordInvocationCost(2);recordInvocationAsset();}),
      inInvocationAccount(second,async()=>{recordInvocationCost(3);await Promise.resolve();recordInvocationCost(4);})
    ]);
    expect(first).toEqual({costUsd:2,createdAssets:true});
    expect(second).toEqual({costUsd:7,createdAssets:false});
  });
  it('rejects malformed graph structure',()=>{
    expect(()=>Graph.fromDict({nodes:'invalid',edges:[]},{skipErrors:false})).toThrow();
  });
});
