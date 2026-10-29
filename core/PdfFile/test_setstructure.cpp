// test_setstructure.cpp — Phase 1 standalone validation for PDF outline write/read roundtrip.
// Build: g++ -o test_setstructure test_setstructure.cpp -L./build/lib/linux_64 -lPdfFile -lgraphics -lUnicodeConverter -lkernel_network -lkernel -lCryptoPPLib -I. -I../DesktopEditor/graphics -lpthread
// Run:   ./test_setstructure <input.pdf> <output.pdf>

#include <cstdio>
#include <cstring>
#include <cstdlib>
#include <string>
#include <vector>
#include <wchar.h>

#include "PdfFile.h"

static void die(const char* msg) { fprintf(stderr, "FAIL: %s\n", msg); exit(1); }

static void writeItem(std::vector<unsigned char>& buf, int page, int level, double y, const std::string& title)
{
    unsigned char tmp[64];
    int n;
    double d;
    n = page;  memcpy(tmp, &n, 4);                              buf.insert(buf.end(), tmp, tmp + 4);
    n = level; memcpy(tmp, &n, 4);                              buf.insert(buf.end(), tmp, tmp + 4);
    d = y;     memcpy(tmp, &d, 8);                              buf.insert(buf.end(), tmp, tmp + 8);
    n = (int)title.size(); memcpy(tmp, &n, 4);                  buf.insert(buf.end(), tmp, tmp + 4);
    buf.insert(buf.end(), title.begin(), title.end());
}

static std::vector<unsigned char> buildPayload()
{
    // [uint32 totalLen][item]*
    // Item: [int32 page][int32 level][double y][int32 strLen][str bytes]
    std::vector<unsigned char> body;
    writeItem(body, 0, 1, 100.0, "Chapter 1");
    writeItem(body, 0, 2,  50.0, "Section 1.1");
    writeItem(body, 0, 2,  30.0, "Section 1.2");
    writeItem(body, 0, 1,  20.0, "Chapter 2");

    std::vector<unsigned char> full;
    unsigned int totalLen = (unsigned int)body.size();
    full.resize(4);
    memcpy(&full[0], &totalLen, 4);
    full.insert(full.end(), body.begin(), body.end());
    return full;
}

static int readInt(const unsigned char* p) { int v; memcpy(&v, p, 4); return v; }
static double readDouble(const unsigned char* p) { double v; memcpy(&v, p, 8); return v; }
static std::string readStr(const unsigned char* p, int len) { return std::string((const char*)p, len); }

// Parse what GetStructure returns (SkipLen/WriteLen format) into a comparable string list.
static std::vector<std::string> parseStructure(const unsigned char* p)
{
    std::vector<std::string> out;
    if (!p) return out;
    int totalLen = readInt(p);
    const unsigned char* end = p + 4 + totalLen;
    const unsigned char* cur = p + 4;
    while (cur + 16 <= end)
    {
        int page  = readInt(cur);    cur += 4;
        int level = readInt(cur);    cur += 4;
        (void)readDouble(cur);        cur += 8;
        int strLen = readInt(cur);   cur += 4;
        if (strLen < 0 || cur + strLen > end) break;
        char buf[256];
        int copy = strLen < 255 ? strLen : 255;
        memcpy(buf, cur, copy); buf[copy] = 0;
        cur += strLen;
        char line[512];
        snprintf(line, sizeof(line), "p=%d l=%d t=%s", page, level, buf);
        out.push_back(line);
    }
    return out;
}

int main(int argc, char** argv)
{
    if (argc < 3) { fprintf(stderr, "usage: %s in.pdf out.pdf\n", argv[0]); return 2; }
    std::string srcPathA = argv[1];
    std::string dstPathA = argv[2];
    std::wstring srcPath(srcPathA.begin(), srcPathA.end());
    std::wstring dstPath(dstPathA.begin(), dstPathA.end());

    std::vector<unsigned char> payload = buildPayload();

    // ---- Phase 1: write via SetStructure on the writer ----
    CPdfFile pdf(nullptr);
    if (!pdf.LoadFromFile(srcPath, L"", nullptr, nullptr))
    {
        fprintf(stderr, "WARN: LoadFromFile returned false; continuing anyway\n");
    }
    fprintf(stderr, "DEBUG: about to call EditPdf\n"); fflush(stderr);
    if (!pdf.EditPdf(dstPath))
        die("EditPdf failed");
    fprintf(stderr, "DEBUG: after EditPdf\n"); fflush(stderr);
    if (!pdf.SetStructure(payload.data(), (DWORD)payload.size()))
        die("SetStructure returned false");
    fprintf(stderr, "DEBUG: after SetStructure\n"); fflush(stderr);
    pdf.Close();
    fprintf(stderr, "DEBUG: after Close\n"); fflush(stderr);
    fprintf(stdout, "PHASE1: SetStructure accepted, Close() flushed\n");

    // ---- Reopen and verify ----
    CPdfFile pdf2(nullptr);
    if (!pdf2.LoadFromFile(dstPath, L"", nullptr, nullptr))
        die("Reload failed");
    unsigned char* got = pdf2.GetStructure();
    std::vector<std::string> items = parseStructure(got);
    if (got) delete[] got;

    fprintf(stdout, "Read back %d items:\n", (int)items.size());
    for (size_t i = 0; i < items.size(); ++i)
        fprintf(stdout, "  [%zu] %s\n", i, items[i].c_str());

    if (items.size() != 4)
    {
        fprintf(stderr, "FAIL: expected 4 bookmarks, got %d\n", (int)items.size());
        return 1;
    }
    // Spot-check titles
    bool ok = true;
    if (items[0].find("Chapter 1") == std::string::npos) ok = false;
    if (items[1].find("Section 1.1") == std::string::npos) ok = false;
    if (items[3].find("Chapter 2") == std::string::npos) ok = false;
    if (!ok)
    {
        fprintf(stderr, "FAIL: title mismatch\n");
        return 1;
    }
    fprintf(stdout, "ROUNDTRIP OK\n");
    return 0;
}