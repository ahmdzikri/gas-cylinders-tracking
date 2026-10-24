# Single image: React SPA (bun + Vite) served by the ASP.NET Core 8 API.
# Build context = repo root:  docker build -t gas-cylinders .

# ---- 1. Frontend ----
FROM oven/bun:1 AS web
WORKDIR /src/web
COPY web/package.json web/bun.lock ./
RUN bun install --frozen-lockfile
COPY web/ ./
RUN bun run build

# ---- 2. Backend ----
FROM mcr.microsoft.com/dotnet/sdk:8.0 AS api
WORKDIR /src
COPY global.json ./
COPY docs/data.json docs/data.json
COPY backend/ backend/
RUN dotnet publish backend/GasCylinders.Api/GasCylinders.Api.csproj -c Release -o /app
COPY --from=web /src/web/dist /app/wwwroot

# ---- 3. Runtime ----
FROM mcr.microsoft.com/dotnet/aspnet:8.0
WORKDIR /app
COPY --from=api /app ./
ENV ASPNETCORE_URLS=http://+:8080 \
    ASPNETCORE_ENVIRONMENT=Production \
    ConnectionStrings__Default="Data Source=/app/data/cylinders.db"
VOLUME ["/app/data"]
EXPOSE 8080
ENTRYPOINT ["dotnet", "GasCylinders.Api.dll"]
