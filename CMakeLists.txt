cmake_minimum_required(VERSION 3.27)
project(SmartSpectraTest)

set(CMAKE_CXX_STANDARD 17)

# Tell CMake where to find our "hacked" headers and libs
include_directories(/usr/local/include)
link_directories(/usr/local/lib)

add_executable(my_app sdk_test.cpp)

# Link the libraries in the specific order needed
target_link_libraries(my_app 
    SmartSpectraContainer 
    SmartSpectraVideoInterface 
    PhysiologyEdge_Edge 
    pthread 
    dl
)
