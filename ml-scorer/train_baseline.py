# ml-scorer/train_baseline.py
"""
Claim B: Statistical Evaluation of Advisory Anomaly Scorer
Calculates Precision, Recall, F1, and False-Positive Cost per 1,000 legitimate sessions
"""
import sys
import numpy as np

def run_claim_b_evaluation():
    np.random.seed(42)
    n_legit = 1000
    n_anomalous = 100
    avg_order_value_inr = 850.0

    # Synthetic Legitimate Sessions: normal intervals (300-3600s), moderate velocity
    legit_inter_arrivals = np.random.exponential(scale=600, size=n_legit) + 30
    legit_spend_ratios = np.random.beta(a=2, b=10, size=n_legit)
    legit_velocity_ratios = np.random.beta(a=2, b=8, size=n_legit)

    # Synthetic Anomalous Sessions: rapid bursts (<20s), high velocity saturation
    burst_inter_arrivals = np.random.uniform(1, 20, size=n_anomalous)
    burst_spend_ratios = np.random.beta(a=5, b=2, size=n_anomalous)
    burst_velocity_ratios = np.random.uniform(0.7, 1.0, size=n_anomalous)

    def score(inter_arrival, spend_ratio, velocity_ratio):
        burst_penalty = 0.45 if inter_arrival < 15 else (0.25 if inter_arrival < 60 else 0.0)
        return min(1.0, (velocity_ratio * 0.35) + (spend_ratio * 0.25) + burst_penalty)

    legit_scores = [score(ia, sr, vr) for ia, sr, vr in zip(legit_inter_arrivals, legit_spend_ratios, legit_velocity_ratios)]
    burst_scores = [score(ia, sr, vr) for ia, sr, vr in zip(burst_inter_arrivals, burst_spend_ratios, burst_velocity_ratios)]

    threshold = 0.65
    tp = sum(1 for s in burst_scores if s >= threshold)
    fn = sum(1 for s in burst_scores if s < threshold)
    fp = sum(1 for s in legit_scores if s >= threshold)
    tn = sum(1 for s in legit_scores if s < threshold)

    precision = tp / (tp + fp) if (tp + fp) > 0 else 0
    recall = tp / (tp + fn) if (tp + fn) > 0 else 0
    f1 = 2 * (precision * recall) / (precision + recall) if (precision + recall) > 0 else 0

    fp_cost_inr = fp * avg_order_value_inr

    print("==================================================")
    print("CLAIM B: ADVISORY ANOMALY SCORER BENCHMARK")
    print("==================================================")
    print(f"Legitimate Sessions Evaluated: {n_legit}")
    print(f"Anomalous Burst Sessions:     {n_anomalous}")
    print(f"Threshold:                    {threshold}")
    print(f"Precision:                    {precision:.3f}")
    print(f"Recall:                       {recall:.3f}")
    print(f"F1 Score:                     {f1:.3f}")
    print(f"False Positives (per 1k):     {fp}")
    print(f"Estimated Friction Cost:      INR {fp_cost_inr:,.2f} per 1,000 legitimate sessions")
    print("==================================================")

if __name__ == "__main__":
    run_claim_b_evaluation()
