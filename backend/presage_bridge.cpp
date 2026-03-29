#include <smartspectra/container/foreground_container.hpp>
#include <smartspectra/container/settings.hpp>
#include <physiology/modules/messages/metrics.h>
#include <physiology/modules/messages/status.h>
#include <iostream>
#include <cstdlib>

using namespace presage::smartspectra;

int main(int argc, char** argv) {
    std::string api_key;
    if (const char* k = std::getenv("SMARTSPECTRA_API_KEY")) {
        api_key = k;
    } else if (argc > 1) {
        api_key = argv[1];
    } else {
        std::cerr << "No API key found\n";
        return 1;
    }

    // Use 'using' alias to avoid the multi-line template declaration issue
    using MySettings = container::settings::Settings
        container::settings::OperationMode::Continuous,
        container::settings::IntegrationMode::Rest
    >;

    MySettings settings;

    settings.video_source.device_index = 0;
    settings.headless                  = true;
    settings.enable_edge_metrics       = true;
    settings.integration.api_key       = api_key;

    auto cont = std::make_unique<container::CpuContinuousRestForegroundContainer>(settings);

    cont->SetOnCoreMetricsOutput(
        [](const presage::physiology::MetricsBuffer& metrics, int64_t ts) {
            float pulse = 0, breathing = 0;
            if (!metrics.pulse().rate().empty())
                pulse = metrics.pulse().rate().rbegin()->value();
            if (!metrics.breathing().rate().empty())
                breathing = metrics.breathing().rate().rbegin()->value();

            if (pulse > 0 && breathing > 0) {
                std::cout << "{\"pulse\":" << pulse
                          << ",\"breathing\":" << breathing << "}"
                          << std::endl;
                std::cout.flush();
            }
            return absl::OkStatus();
        }
    );

    if (auto s = cont->Initialize(); !s.ok()) {
        std::cerr << "Init failed: " << s.message() << "\n";
        return 1;
    }

    cont->Run();
    return 0;
}