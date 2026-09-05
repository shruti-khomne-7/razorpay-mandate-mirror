# ml-scorer/app.py
from fastapi import FastAPI
from pydantic import BaseModel
from typing import Optional
import numpy as np

app = FastAPI(title="Mandate Mirror Advisory Anomaly Scorer", version="1.0.0")

class SessionFeatures(BaseModel):
    amount_paise: int
    cumulative_spend: int = 0
    cumulative_cap: int = 500000
    transaction_count_in_window: int = 0
    velocity_limit: int = 100
    seconds_since_last_txn: Optional[int] = 3600
    category: Optional[str] = "general"

@app.get("/health")
def health():
    return {"status": "ok", "service": "mandate-mirror-ml-scorer"}

@app.post("/score")
def score_session(features: SessionFeatures):
    """
    Computes an advisory anomaly score in [0.0, 1.0] using multi-feature statistical distance:
    - Velocity saturation ratio
    - Burst clustering (inter-arrival interval < 30s)
    - Single transaction cap consumption ratio
    """
    velocity_ratio = min(1.0, features.transaction_count_in_window / max(1, features.velocity_limit))
    spend_ratio = min(1.0, features.amount_paise / max(1, features.cumulative_cap))
    
    inter_arrival = features.seconds_since_last_txn if features.seconds_since_last_txn is not None else 3600
    if inter_arrival < 15:
        burst_penalty = 0.45
    elif inter_arrival < 60:
        burst_penalty = 0.25
    elif inter_arrival < 300:
        burst_penalty = 0.10
    else:
        burst_penalty = 0.0

    raw_score = (velocity_ratio * 0.35) + (spend_ratio * 0.25) + burst_penalty
    anomaly_score = float(np.clip(round(raw_score, 3), 0.0, 1.0))
    is_anomalous = bool(anomaly_score > 0.65)

    return {
        "anomaly_score": anomaly_score,
        "is_anomalous": is_anomalous,
        "features": {
            "velocity_ratio": round(velocity_ratio, 3),
            "spend_ratio": round(spend_ratio, 3),
            "inter_arrival_seconds": inter_arrival,
            "burst_penalty": burst_penalty
        }
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8001)
