from env.environment import CrisisManagementEnv
from env.reward import calculate_nlp_bonus
env = CrisisManagementEnv(task_id=1)
obs = env.reset(seed=42)
msg = 'Downtown evacuate fire!'
print("Score:", calculate_nlp_bonus(msg, obs))
