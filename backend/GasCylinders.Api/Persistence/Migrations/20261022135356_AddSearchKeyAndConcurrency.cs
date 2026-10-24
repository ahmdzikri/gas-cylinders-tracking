using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace GasCylinders.Api.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddSearchKeyAndConcurrency : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AlterColumn<string>(
                name: "SerialNumber",
                table: "Cylinders",
                type: "TEXT",
                maxLength: 10,
                nullable: false,
                collation: "NOCASE",
                oldClrType: typeof(string),
                oldType: "TEXT",
                oldMaxLength: 10);

            migrationBuilder.AddColumn<string>(
                name: "SearchKey",
                table: "Cylinders",
                type: "TEXT",
                maxLength: 160,
                nullable: false,
                defaultValue: "");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "SearchKey",
                table: "Cylinders");

            migrationBuilder.AlterColumn<string>(
                name: "SerialNumber",
                table: "Cylinders",
                type: "TEXT",
                maxLength: 10,
                nullable: false,
                oldClrType: typeof(string),
                oldType: "TEXT",
                oldMaxLength: 10,
                oldCollation: "NOCASE");
        }
    }
}
