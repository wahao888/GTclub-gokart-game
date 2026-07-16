#!/usr/bin/env bash
set -euo pipefail

REGION="${AWS_REGION:-ap-southeast-1}"
INSTANCE_ID="${INSTANCE_ID:-$(curl -fsS http://169.254.169.254/latest/meta-data/instance-id)}"

alarm() {
  aws cloudwatch put-metric-alarm --region "$REGION" --dimensions "Name=InstanceId,Value=$INSTANCE_ID" "$@"
}

alarm --alarm-name "formula-kart-status-check" --namespace AWS/EC2 --metric-name StatusCheckFailed --statistic Maximum --period 60 --evaluation-periods 2 --threshold 1 --comparison-operator GreaterThanOrEqualToThreshold --treat-missing-data missing
alarm --alarm-name "formula-kart-cpu-high" --namespace AWS/EC2 --metric-name CPUUtilization --statistic Average --period 300 --evaluation-periods 3 --threshold 80 --comparison-operator GreaterThanOrEqualToThreshold --treat-missing-data missing
alarm --alarm-name "formula-kart-cpu-credits-low" --namespace AWS/EC2 --metric-name CPUCreditBalance --statistic Minimum --period 300 --evaluation-periods 2 --threshold 60 --comparison-operator LessThanThreshold --treat-missing-data missing
alarm --alarm-name "formula-kart-surplus-credits" --namespace AWS/EC2 --metric-name CPUSurplusCreditsCharged --statistic Sum --period 300 --evaluation-periods 1 --threshold 0 --comparison-operator GreaterThanThreshold --treat-missing-data missing

aws cloudwatch describe-alarms --region "$REGION" --alarm-name-prefix formula-kart --query 'MetricAlarms[].{Name:AlarmName,State:StateValue}' --output table
