# Keel BNB SDK verification. Run: python verify.py   (add --register to register identity)
import os, sys
try:
    from dotenv import load_dotenv; load_dotenv()
except Exception:
    pass

print("=== Keel BNB SDK verification ===")
try:
    import bnbagent
    from bnbagent import config
except Exception as e:
    print("FAIL import bnbagent:", e, "->  pip install bnbagent"); sys.exit(1)

print("PASS bnbagent", getattr(bnbagent, "__version__", "?"))
for net in ("bsc-mainnet", "bsc-testnet"):
    nc = config.resolve_network(net)
    has = bool(getattr(nc, "registry_contract", None))
    print(f"[{net}] chain {nc.chain_id} registry {nc.registry_contract} "
          f"{'PASS' if has else 'FAIL'} gasfree={nc.use_paymaster}")

if "--register" in sys.argv:
    from bnbagent import ERC8004Agent, EVMWalletProvider, AgentEndpoint
    PW = os.getenv("BNB_WALLET_PASSWORD"); PK = os.getenv("BNB_PRIVATE_KEY")
    NET = os.getenv("BNB_NETWORK", "bsc-mainnet")
    if not PW:
        print("FAIL BNB_WALLET_PASSWORD missing in .env"); sys.exit(1)
    w = EVMWalletProvider(password=PW, private_key=(PK or None))
    a = ERC8004Agent(wallet_provider=w, network=NET)
    uri = a.generate_agent_uri(
        name="Keel",
        description="Drawdown-aware autonomous trading agent",
        endpoints=[AgentEndpoint(name="risk",
            endpoint=os.getenv("RISK_SERVICE_URL", "http://localhost:8000/risk"), version="1.0")],
    )
    res = a.register_agent(agent_uri=uri)
    print("PASS registered:", res)
    tx = res.get("transactionHash") or res.get("tx_hash")
    if tx: print("verify https://bscscan.com/tx/" + tx)
else:
    print("\n(registration skipped — add --register to register on",
          os.getenv("BNB_NETWORK", "bsc-mainnet"), ")")
