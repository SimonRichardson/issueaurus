.PHONY: data serve

data:
	python3 scripts/fetch_issues.py

serve:
	python3 -m http.server 8080