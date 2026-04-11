from log_validator import LogValidator

bad_log = """
[START] task=1 env=test model=m
[STEP] step=1 action={"allocations": {}} reward=0.0
[END] score=1.0
"""

bad_log_missing_end = """
[START] task=1 env=test model=m
[STEP] step=1 action={"allocations": {}} reward=0.0
"""

bad_log_bad_json = """
[START] task=1 env=test model=m
[STEP] step=1 action={allocations: {}} reward=0.0
[END] score=1.0
"""

valid_log = """
[START] task=1 env=test model=m
[STEP] step=1 action={"allocations": {}} reward=0.0 done=false error=null
[STEP] step=2 action={"allocations": {}} reward=1.0 done=true error=null
[END] success=true steps=2 score=1.0 rewards=0.0,1.0
"""

validator = LogValidator()
assert validator.validate(bad_log) == True, "bad_log should be treated as valid minimally"

validator = LogValidator()
assert validator.validate(bad_log_missing_end) == False, "Missing end"

validator = LogValidator()
assert validator.validate(bad_log_bad_json) == False, "Bad JSON"

validator = LogValidator()
assert validator.validate(valid_log) == True, "Valid log"

print("All validator tests passed!")
