# Cloud Vega simulator host

Provisioned October 13, 2026 in `us-east-1` for official simulator testing.

## Cleanup verified October 16

AWS `DescribeHosts` reports dedicated host `h-08c439aae64c3ece5` as **released**. Neither disposable simulator instance appears in `DescribeInstances` for its exact ID. No replacement host has been launched. The provisioning details below are historical; there is no active simulator viewer. A future recording session requires a newly authorized, explicitly time-bounded host or a locally available official simulator.

- Instance: `i-08103b0ca22704b64`, `m7i.xlarge` (4 vCPU, 16 GiB RAM).
- Ubuntu 24.04; nested virtualization explicitly enabled.
- 80 GiB encrypted gp3 root volume, deleted on termination.
- Security group has no inbound rules. Administration uses Systems Manager.
- No Elastic IP, NAT gateway, GPU, or paid bare-metal host.
- EventBridge Scheduler `hearth-vega-expire-20261112` terminates this exact instance at **2026-10-15 10:00 UTC**, retries failures for up to 24 hours, and deletes the schedule after completion. Its historical name does not reflect the revised deadline.
- Expiry role can terminate only this instance. Host role grants SSM managed-node access, not application AWS credentials.

Public on-demand compute price checked with AWS Price List API: $0.2016/hour, or $145.152 for 30 days continuously running. Storage, public IPv4, data transfer, and application model usage are additional. Credits and taxes are not included; this is not a hard spending cap.

Use AWS Console → Systems Manager → Session Manager to connect to the instance. Remote desktop ports must remain private; use Session Manager port forwarding rather than exposing VNC publicly.

The existing Hearth backend stays on its original host. This machine is disposable simulator infrastructure, not a migration of companion memories or credentials.

Provisioning is not proof of app execution. Record official simulator evidence only after Hearth visibly renders and remote navigation and audio are verified.

## Verified result

KVM acceleration is available and SDK 0.24.12112 successfully boots its official x86_64 virtual device. Hearth package download passed SHA-256 verification. Installation fails with `Module dependency not found` for `/com.amazon.kepler.webview_4@IWebview_4`. The WebView npm package advertises `sim_tv_aarch64`, not this simulator architecture. No Hearth-rendering evidence is available yet.

A persistent systemd expiry timer also shuts down the host at the same expiry time as a local fallback. Instance-initiated shutdown is configured to terminate, not stop. Administrative EC2 StopInstances calls can still stop it for cost savings without deleting the SDK.

To remove early, terminate the instance in EC2 and delete its expiry schedule. After termination, the `HearthVegaDemoHost` instance profile/role, `HearthVegaDemoExpiry` role, and `hearth-vega-demo` security group can be deleted; these configuration resources do not themselves incur hourly compute/storage charges.

## ARM Mac simulator host

Allocated October 13 after M1/M2 capacity was unavailable in the tested zones.

- Dedicated host `h-08c439aae64c3ece5`, `mac-m4.metal`, `us-east-1a`.
- Instance `i-04e3378de3696966c`; macOS Sequoia 15.8, 24 GiB RAM, 150 GiB encrypted gp3 EBS with delete-on-termination.
- Same no-inbound security group and SSM-only instance profile; no application credentials are copied.
- AWS Price List rate: **$1.23/host-hour**, minimum allocation **24 hours ($29.52)**. Thirty days continuously allocated costs **$885.60** for the host alone. EBS, public IPv4, data transfer, and taxes are additional; credit eligibility is not verified.
- **Stopping or terminating the Mac instance does not stop dedicated-host billing. Release the dedicated host too**, after the minimum allocation and scrub workflow permit it.
- `hearth-arm-vega-terminate-20261112` terminates the instance on **October 15 at 10:00 UTC**, about 36 hours after allocation. Its historical name is unchanged. The user requires a maximum 72-hour lifetime; never extend or launch replacement infrastructure without an explicit bounded expiry.
- `hearth-arm-vega-release-host` requests release every 15 minutes starting October 15 at 10:15 UTC through October 22, allowing the host scrub to finish. ReleaseHosts can report failures in its response rather than throwing, so repeated independent requests are intentional. These retries do not authorize continued simulator runtime. Verify the host reaches `released`; scheduled cleanup is not an absolute guarantee against permission changes or prolonged service failure. The earlier termination leaves about 36 hours for cleanup before the user's 72-hour deadline of October 16 at 22:09 UTC.
- The expiry role is restricted to this exact instance and host.

The ARM Hearth package builds, passes VPT validation, installs, and visibly renders on the official ARM simulator. Authenticated simulator-console framebuffer captures and remote-selected dialogue are verified in `docs/official-simulator.md`. The remote OK event is `kpenter`; the native wrapper maps it explicitly. Phone pairing and Sonic audio on this simulator remain unverified. Prefer releasing early once complete demo evidence has been captured; the bounded expiry is a safety deadline, not a recommendation to keep it allocated.
